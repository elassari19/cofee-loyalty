import type { EntityManager, QueryDeepPartialEntity } from "typeorm";

import { getDb } from "@/db/connection";
import {
  DomainEventOutboxEntity,
  type DomainEventOutbox,
} from "@/db/entities/domain-event-outbox.entity";
import { ValidationError } from "@/lib/errors";
import { getLogger } from "@/lib/logger";

/**
 * Transactional outbox: enqueue inside the write, deliver after commit
 * (checklist §8 bullet 12 — "publish … only after commit … via a durable
 * outbox").
 *
 * The unit of work is one business fact, written as a row:
 *
 * ```ts
 * await runInTransaction(async (em) => {
 *   const entry = await recordEarn(em, {...});
 *   await enqueueDomainEvent(em, {
 *     merchantId,
 *     eventType: "loyalty.transaction.created",
 *     aggregateType: "loyalty_transaction",
 *     aggregateId: entry.id,
 *     payload: { delta: entry.delta, unit: entry.unit },
 *     idempotencyKey: `loyalty.transaction.created:${entry.id}`,
 *   });
 * });
 * // commit — then, and only then, deliver:
 * await dispatchOutbox();
 * ```
 *
 * Guarantees, in order of what can go wrong:
 *
 * - **Never announced early**: the row commits with the change or is rolled
 *   back with it. A consumer can never see an event for a balance that never
 *   moved.
 * - **Never lost**: delivery is a separate step, so a crash between commit and
 *   publish leaves the row `PENDING` for the next dispatcher pass.
 * - **Never applied twice**: `UNIQUE (merchant_id, idempotency_key)` plus the
 *   single-delivery state machine means a retried write reuses the row, and a
 *   handler that runs twice for one row is the handler's problem — the
 *   envelope carries a stable `id` to deduplicate on.
 * - **Never blocks the customer**: delivery failure writes `last_error` and a
 *   backoff; it never rolls back or fails the request that produced it.
 */

/** Closed domain of event types — adding one is a reviewed code change. */
export const DOMAIN_EVENT_TYPES = ["loyalty.transaction.created"] as const;
export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

/** Give up after this many deliveries; the row stays visible as `FAILED`. */
export const MAX_EVENT_ATTEMPTS = 5;

export interface DomainEventInput {
  merchantId: string;
  eventType: DomainEventType;
  /** Kind of row `aggregateId` points at, e.g. `loyalty_transaction`. */
  aggregateType: string;
  aggregateId: string;
  /** Ids and numbers only — events cross the tenant boundary later. */
  payload: Record<string, unknown>;
  /** Stable business key: the same logical write never enqueues twice. */
  idempotencyKey: string;
}

export interface DomainEventEnvelope {
  id: string;
  merchantId: string;
  eventType: DomainEventType;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  /** 1-based attempt number of this delivery. */
  attempt: number;
  createdAt: Date;
}

export type DomainEventHandler = (
  event: DomainEventEnvelope,
) => void | Promise<void>;

const handlers = new Map<DomainEventType, Set<DomainEventHandler>>();

/**
 * Subscribes to one event type. Returns an unsubscribe function — handlers
 * registered by a test must be removed again, the registry is process-wide.
 */
export function registerDomainEventHandler(
  eventType: DomainEventType,
  handler: DomainEventHandler,
): () => void {
  const set = handlers.get(eventType) ?? new Set<DomainEventHandler>();
  set.add(handler);
  handlers.set(eventType, set);
  return () => {
    set.delete(handler);
    if (set.size === 0) handlers.delete(eventType);
  };
}

/**
 * Appends the event in the caller's transaction. Use `orIgnore` semantics so
 * a duplicate business key is a no-op *inside* the transaction — a unique
 * violation would otherwise abort it and take the ledger write down with it.
 */
export async function enqueueDomainEvent(
  em: EntityManager,
  input: DomainEventInput,
): Promise<void> {
  if (!DOMAIN_EVENT_TYPES.includes(input.eventType)) {
    throw new ValidationError([
      { path: "eventType", message: "Unknown domain event type." },
    ]);
  }
  const key = input.idempotencyKey.trim();
  if (key.length === 0 || key.length > 200) {
    throw new ValidationError([
      {
        path: "idempotencyKey",
        message: "An outbox idempotency key must be 1–200 characters.",
      },
    ]);
  }

  await em
    .createQueryBuilder()
    .insert()
    .into(DomainEventOutboxEntity)
    .values({
      merchantId: input.merchantId,
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload:
        input.payload as QueryDeepPartialEntity<DomainEventOutbox>["payload"],
      idempotencyKey: key,
      status: "PENDING",
      attempts: 0,
      availableAt: new Date(),
      createdAt: new Date(),
    })
    .orIgnore()
    .execute();
}

export interface DispatchOutcome {
  /** Rows claimed by this pass. */
  claimed: number;
  delivered: number;
  /** Retried after a handler failure (still `PENDING`, backed off). */
  retried: number;
  /** Rows that exhausted `MAX_EVENT_ATTEMPTS` and are now `FAILED`. */
  failed: number;
}

interface ClaimedRow {
  id: string;
  merchant_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  attempts: number;
  created_at: Date;
}

/** Exponential backoff, capped at a minute: 1s, 2s, 4s, 8s, 16s. */
function backoffMs(attempts: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.max(0, attempts - 1));
}

function truncate(message: string, max = 480): string {
  return message.length > max ? `${message.slice(0, max - 1)}…` : message;
}

function resolveHandlers(eventType: string): DomainEventHandler[] {
  if (!DOMAIN_EVENT_TYPES.includes(eventType as DomainEventType)) {
    throw new Error(`No handler domain for event type "${eventType}".`);
  }
  return [...(handlers.get(eventType as DomainEventType) ?? [])];
}

/**
 * Claims due `PENDING` rows and runs their handlers.
 *
 * Claiming uses `FOR UPDATE SKIP LOCKED` inside one short transaction, so two
 * dispatcher passes (two processes, two intervals) never deliver the same row
 * and never block each other. Handlers run while the claim is held: they must
 * be fast and must not assume the row is theirs to mutate. Their failure is
 * recorded and backed off — it never escapes to the caller and never touches
 * the ledger.
 */
export async function dispatchOutbox(
  options: { limit?: number } = {},
): Promise<DispatchOutcome> {
  const limit = options.limit ?? 50;
  const db = await getDb();
  const outcome: DispatchOutcome = {
    claimed: 0,
    delivered: 0,
    retried: 0,
    failed: 0,
  };

  await db.transaction("READ COMMITTED", async (em) => {
    const rows = await em.query<ClaimedRow[]>(
      `SELECT id, merchant_id, event_type, aggregate_type, aggregate_id,
              payload, idempotency_key, attempts, created_at
         FROM domain_event_outbox
        WHERE status = 'PENDING'
          AND available_at <= now()
        ORDER BY created_at ASC
        LIMIT $1
          FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    outcome.claimed = rows.length;

    for (const row of rows) {
      const attempt = row.attempts + 1;
      try {
        for (const handler of resolveHandlers(row.event_type)) {
          await handler({
            id: row.id,
            merchantId: row.merchant_id,
            eventType: row.event_type as DomainEventType,
            aggregateType: row.aggregate_type,
            aggregateId: row.aggregate_id,
            payload: row.payload,
            idempotencyKey: row.idempotency_key,
            attempt,
            createdAt: row.created_at,
          });
        }
        await em.update(
          DomainEventOutboxEntity,
          { id: row.id },
          {
            status: "DELIVERED",
            attempts: attempt,
            deliveredAt: new Date(),
            lastError: null,
          },
        );
        outcome.delivered++;
      } catch (error) {
        const exhausted = attempt >= MAX_EVENT_ATTEMPTS;
        const message = truncate(
          error instanceof Error ? error.message : String(error),
        );
        await em.update(
          DomainEventOutboxEntity,
          { id: row.id },
          {
            status: exhausted ? "FAILED" : "PENDING",
            attempts: attempt,
            lastError: message,
            availableAt: new Date(Date.now() + backoffMs(attempt)),
          },
        );
        if (exhausted) {
          outcome.failed++;
        } else {
          outcome.retried++;
        }
        getLogger().error(
          {
            eventId: row.id,
            eventType: row.event_type,
            attempt,
            exhausted,
            err: message,
          },
          "domain event delivery failed",
        );
      }
    }
  });

  return outcome;
}

/**
 * The dispatcher pass an action runs *after* its commit.
 *
 * Deliberately never throws: the ledger write is already durable, so a failed
 * delivery pass must not turn a successful purchase into an error response —
 * the rows stay `PENDING` and the periodic pass retries them.
 */
export async function dispatchOutboxSafely(): Promise<DispatchOutcome> {
  try {
    return await dispatchOutbox();
  } catch (error) {
    getLogger().error(
      { err: error instanceof Error ? error.message : String(error) },
      "outbox dispatch pass failed",
    );
    return { claimed: 0, delivered: 0, retried: 0, failed: 0 };
  }
}

/**
 * Periodic pass so an event enqueued by a request whose dispatcher never ran
 * still goes out. Safe to call twice (tests): each call returns a stop
 * function, and every pass is a best-effort `catch`.
 */
export function startOutboxDispatcher(
  options: { intervalMs?: number } = {},
): () => void {
  const intervalMs = options.intervalMs ?? 15_000;
  const pass = () => {
    void dispatchOutbox().catch((error: unknown) => {
      getLogger().error(
        { err: error instanceof Error ? error.message : String(error) },
        "outbox dispatcher pass failed",
      );
    });
  };
  pass();
  const timer = setInterval(pass, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** Read helper for tests and ops: one merchant's most recent outbox rows. */
export async function listOutbox(
  em: EntityManager,
  merchantId: string,
  limit = 20,
): Promise<DomainEventOutbox[]> {
  return em.find(DomainEventOutboxEntity, {
    where: { merchantId },
    order: { createdAt: "DESC" },
    take: limit,
  });
}
