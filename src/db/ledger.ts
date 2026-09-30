import { randomUUID } from "node:crypto";
import type { EntityManager, QueryDeepPartialEntity } from "typeorm";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type FieldIssue,
} from "@/lib/errors";
import type { LedgerType, LoyaltyUnit } from "./entities/enums";
import { LoyaltyMembershipEntity } from "./entities/loyalty-membership.entity";
import {
  LoyaltyTransactionEntity,
  type LoyaltyTransaction,
} from "./entities/loyalty-transaction.entity";

/**
 * The loyalty ledger API (PRD §13, checklist §4).
 *
 * Every balance change goes through `recordEarn`, `recordAdjustment`,
 * `recordRedemption` or `recordRewardRedemption`, all of which funnel into
 * `appendLedgerEntry`. Callers wrap them in `runInTransaction`
 * (src/db/transactions.ts) so the append and the projection move together:
 *
 * ```ts
 * await runInTransaction((em) =>
 *   recordEarn(em, {
 *     merchantId,
 *     membershipId,
 *     unit: "POINTS",
 *     delta: 100,
 *     purchaseAmount: 25,
 *     currency: "EUR",
 *     idempotencyKey: request.idempotencyKey,
 *   }),
 * );
 * ```
 *
 * Concurrency strategy — the correctness core of this module:
 *
 * 1. `SELECT ... FOR UPDATE` on `loyalty_membership` serialises every writer
 *    of one membership's balance for the rest of the transaction. Two
 *    concurrent redemptions of the last 50 points queue up; the second one
 *    sees the reduced balance and fails cleanly instead of going negative.
 * 2. The ledger row is appended and `loyalty_membership.balance` is
 *    incremented while the lock is held, then the transaction commits. A
 *    reader therefore never observes a balance without its entry.
 * 3. `CHECK (balance >= 0)` is the last line of defence: if application logic
 *    ever raced, the database refuses the write rather than corrupting state.
 * 4. `UNIQUE (merchant_id, idempotency_key)` makes retried submissions apply
 *    exactly once: a replay returns the original entry without appending a
 *    second one or touching the balance.
 *
 * The ledger rows themselves are immutable — a `BEFORE UPDATE OR DELETE`
 * trigger rejects any attempt to rewrite them. Mistakes are corrected with
 * an `*_ADJUSTED` reversing entry through this same API.
 */

export interface LedgerEntryInput {
  merchantId: string;
  membershipId: string;
  /** The dimension the entry moves — must match the entry type. */
  unit: LoyaltyUnit;
  /** Signed change: > 0 earns, < 0 redeems, <> 0 adjusts. */
  delta: number;
  /** Program context frozen onto the entry (rule versioning, PRD §6). */
  programId?: string | null;
  ruleVersion?: number | null;
  purchaseAmount?: number | null;
  currency?: string | null;
  /** Required for adjustments: why a human changed the balance. */
  reason?: string | null;
  rewardId?: string | null;
  redemptionId?: string | null;
  /** Staff/owner/admin user responsible for the entry. */
  createdBy?: string | null;
  idempotencyKey?: string | null;
  /** External (POS) reference, unique per merchant. */
  externalRef?: string | null;
  metadata?: Record<string, unknown>;
}

export interface BalanceReport {
  membershipId: string;
  /** `loyalty_membership.balance` — the transactionally maintained projection. */
  projected: number;
  /** `SUM(loyalty_transaction.delta)` — ground truth. */
  ledger: number;
  inSync: boolean;
}

const EARNED_TYPES: Record<LoyaltyUnit, LedgerType> = {
  POINTS: "POINTS_EARNED",
  STAMPS: "STAMP_EARNED",
};

const ADJUSTED_TYPES: Record<LoyaltyUnit, LedgerType> = {
  POINTS: "POINTS_ADJUSTED",
  STAMPS: "STAMP_ADJUSTED",
};

const REDEEMED_TYPES: Record<LoyaltyUnit, LedgerType> = {
  POINTS: "POINTS_REDEEMED",
  STAMPS: "STAMP_REDEEMED",
};

function unitForType(type: LedgerType): LoyaltyUnit | undefined {
  switch (type) {
    case "POINTS_EARNED":
    case "POINTS_ADJUSTED":
    case "POINTS_REDEEMED":
      return "POINTS";
    case "STAMP_EARNED":
    case "STAMP_ADJUSTED":
    case "STAMP_REDEEMED":
      return "STAMPS";
    case "REWARD_REDEEMED":
      // A reward can be paid in either dimension; the caller's `unit` stands.
      return undefined;
  }
}

/**
 * Mirrors the CHECK constraints in `loyalty-transaction.entity.ts` so callers
 * get a 400 with field issues instead of an opaque database error. The
 * database remains authoritative — this is a friendlier early exit.
 */
function validateEntry(
  type: LedgerType,
  unit: LoyaltyUnit,
  delta: number,
  reason: string | null | undefined,
): void {
  const issues: FieldIssue[] = [];

  if (!Number.isInteger(delta)) {
    issues.push({ path: "delta", message: "Must be a whole number." });
  }
  if (delta === 0) {
    issues.push({
      path: "delta",
      message: "A ledger entry must change the balance.",
    });
  }

  const expectedUnit = unitForType(type);
  if (expectedUnit !== undefined && unit !== expectedUnit) {
    issues.push({
      path: "unit",
      message: `${type} entries must move ${expectedUnit}.`,
    });
  }

  if (type.endsWith("_EARNED") && delta <= 0) {
    issues.push({ path: "delta", message: "Earned entries must be positive." });
  }
  if (type.endsWith("_REDEEMED") && delta >= 0) {
    issues.push({
      path: "delta",
      message: "Redemption entries must be negative.",
    });
  }
  if (type.endsWith("_ADJUSTED") && !(reason ?? "").trim()) {
    issues.push({
      path: "reason",
      message: "An adjustment requires a reason.",
    });
  }

  if (issues.length > 0) throw new ValidationError(issues);
}

interface LockedMembershipRow {
  id: string;
  merchant_id: string;
  customer_profile_id: string;
  balance: number;
  status: string;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate =
    "driverError" in error
      ? (error as { driverError?: unknown }).driverError
      : error;
  if (typeof candidate !== "object" || candidate === null) return false;
  return (candidate as { code?: unknown }).code === "23505";
}

async function findByIdempotencyKey(
  em: EntityManager,
  merchantId: string,
  idempotencyKey: string,
): Promise<LoyaltyTransaction | null> {
  return em.findOne(LoyaltyTransactionEntity, {
    where: { merchantId, idempotencyKey },
  });
}

async function findByExternalRef(
  em: EntityManager,
  merchantId: string,
  externalRef: string,
): Promise<LoyaltyTransaction | null> {
  return em.findOne(LoyaltyTransactionEntity, {
    where: { merchantId, externalRef },
  });
}

/**
 * Append one immutable ledger entry and advance the balance projection in
 * the caller's transaction while holding the membership row lock.
 */
export async function appendLedgerEntry(
  em: EntityManager,
  input: LedgerEntryInput & { type: LedgerType },
): Promise<LoyaltyTransaction> {
  const reason = input.reason?.trim() || null;
  validateEntry(input.type, input.unit, input.delta, reason);

  // Replay fast-path: a duplicate submission is not an error, it is a no-op
  // that returns what already happened.
  if (input.idempotencyKey) {
    const existing = await findByIdempotencyKey(
      em,
      input.merchantId,
      input.idempotencyKey,
    );
    if (existing) return existing;
  }

  const lockedRows = await em.query<LockedMembershipRow[]>(
    `SELECT id, merchant_id, customer_profile_id, balance, status
       FROM loyalty_membership
      WHERE id = $1
        FOR UPDATE`,
    [input.membershipId],
  );
  const membership = lockedRows[0];
  if (!membership) {
    throw new NotFoundError("The loyalty membership was not found.");
  }
  if (membership.merchant_id !== input.merchantId) {
    throw new ForbiddenError(
      "This membership belongs to a different merchant.",
    );
  }
  if (membership.status !== "active") {
    throw new ConflictError("This loyalty membership is closed.");
  }
  if (membership.balance + input.delta < 0) {
    throw new ConflictError(
      "This membership does not have enough value to complete the change.",
    );
  }

  const entryId = randomUUID();
  try {
    await em.insert(LoyaltyTransactionEntity, {
      id: entryId,
      merchantId: input.merchantId,
      membershipId: input.membershipId,
      customerProfileId: membership.customer_profile_id,
      programId: input.programId ?? null,
      ruleVersion: input.ruleVersion ?? null,
      type: input.type,
      unit: input.unit,
      delta: input.delta,
      purchaseAmount: input.purchaseAmount ?? null,
      currency: input.currency ?? null,
      reason,
      rewardId: input.rewardId ?? null,
      redemptionId: input.redemptionId ?? null,
      createdBy: input.createdBy ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      externalRef: input.externalRef ?? null,
      // `QueryDeepPartialEntity` recurses into `unknown` JSON values and
      // collapses them to `{}`, which `Record<string, unknown>` does not
      // satisfy. Every other field above stays fully type-checked; only this
      // value is asserted into the driver's deep-partial shape.
      metadata: (input.metadata ??
        {}) as QueryDeepPartialEntity<LoyaltyTransaction>["metadata"],
      createdAt: new Date(),
    });
  } catch (error) {
    // Lost a race with a concurrent duplicate: whichever unique constraint
    // fired, the row that won is the answer — return it, change nothing.
    if (isUniqueViolation(error)) {
      const existing = input.idempotencyKey
        ? await findByIdempotencyKey(em, input.merchantId, input.idempotencyKey)
        : null;
      if (existing) return existing;
      if (input.externalRef) {
        const existingByRef = await findByExternalRef(
          em,
          input.merchantId,
          input.externalRef,
        );
        if (existingByRef) return existingByRef;
      }
    }
    throw error;
  }

  await em.update(
    LoyaltyMembershipEntity,
    { id: input.membershipId },
    { balance: () => `"balance" + (${input.delta})` },
  );

  const entry = await em.findOneBy(LoyaltyTransactionEntity, { id: entryId });
  if (!entry) {
    throw new ConflictError("The ledger entry could not be read back.");
  }
  return entry;
}

/** Award value: `delta` is positive, type is `POINTS_EARNED`/`STAMP_EARNED`. */
export function recordEarn(
  em: EntityManager,
  input: LedgerEntryInput & { delta: number },
): Promise<LoyaltyTransaction> {
  return appendLedgerEntry(em, {
    ...input,
    type: EARNED_TYPES[input.unit],
  });
}

/**
 * Correct history with a signed reversing entry — never by editing a row
 * (checklist §4). A `reason` is mandatory and enforced by both this API and
 * a CHECK constraint.
 */
export function recordAdjustment(
  em: EntityManager,
  input: LedgerEntryInput & { delta: number; reason: string },
): Promise<LoyaltyTransaction> {
  return appendLedgerEntry(em, {
    ...input,
    type: ADJUSTED_TYPES[input.unit],
  });
}

/** Spend value on something other than a reward: pass a negative `delta`. */
export function recordRedemption(
  em: EntityManager,
  input: LedgerEntryInput & { delta: number },
): Promise<LoyaltyTransaction> {
  return appendLedgerEntry(em, {
    ...input,
    type: REDEEMED_TYPES[input.unit],
  });
}

/**
 * Spend value on a reward. The single ledger row doubles as the audit link
 * between the redemption code and the value it consumed.
 */
export function recordRewardRedemption(
  em: EntityManager,
  input: LedgerEntryInput & { delta: number; rewardId: string },
): Promise<LoyaltyTransaction> {
  if (!input.redemptionId) {
    throw new ValidationError([
      { path: "redemptionId", message: "A reward redemption requires an id." },
    ]);
  }
  return appendLedgerEntry(em, { ...input, type: "REWARD_REDEEMED" });
}

/**
 * Reconciliation: compares the projection with `SUM(delta)` (checklist §4 —
 * "reconciliation tests proving it matches the ledger"). Runs as one plain
 * read; no lock is needed because the projection only ever changes under the
 * membership lock, so any snapshot is internally consistent.
 */
export async function readBalanceReport(
  em: EntityManager,
  membershipId: string,
): Promise<BalanceReport> {
  const rows = await em.query<Array<{ balance: number; ledger: number }>>(
    `SELECT m.balance::int AS balance,
            COALESCE(SUM(t.delta), 0)::int AS ledger
       FROM loyalty_membership m
       LEFT JOIN loyalty_transaction t ON t.membership_id = m.id
      WHERE m.id = $1
      GROUP BY m.id, m.balance`,
    [membershipId],
  );
  const row = rows[0];
  if (!row) {
    throw new NotFoundError("The loyalty membership was not found.");
  }
  return {
    membershipId,
    projected: row.balance,
    ledger: row.ledger,
    inSync: row.balance === row.ledger,
  };
}

/** Ground truth: the balance derived from the immutable ledger. */
export async function computeBalanceFromLedger(
  em: EntityManager,
  membershipId: string,
): Promise<number> {
  return (await readBalanceReport(em, membershipId)).ledger;
}

/** Fails loudly when the projection has drifted — used by tests and ops tooling. */
export async function assertProjectionMatchesLedger(
  em: EntityManager,
  membershipId: string,
): Promise<BalanceReport> {
  const report = await readBalanceReport(em, membershipId);
  if (!report.inSync) {
    throw new ConflictError(
      "The membership balance projection does not match the ledger.",
    );
  }
  return report;
}
