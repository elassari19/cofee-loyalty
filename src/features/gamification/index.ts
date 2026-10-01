/**
 * Gamification boundary (checklist §12 — "Keep gamification definitions /
 * versioning separate from the ledger. Any future points/stamps awarded by
 * challenges or badges must use the existing loyalty transaction service").
 *
 * Architecture contract:
 *
 * - Gamification mechanics (badges, challenges, streaks, leaderboards) are
 *   defined here as versioned, configurable entities.
 * - Mechanics are evaluated from authorized domain events — the engine never
 *   reads the loyalty ledger directly.
 * - Any loyalty value awarded by a mechanic MUST be issued through the
 *   existing loyalty transaction service (src/features/loyalty/transactions.ts).
 *   The gamification engine calls `earnPoints` / `earnStamps`, never writes
 *   `loyalty_transaction` rows directly.
 * - Each mechanic definition is versioned so historical evaluation remains
 *   reproducible. Changing rules produces a new version, not an edit.
 * - Anti-abuse controls (eligibility, time windows, limits) are enforced by
 *   the mechanic evaluator before it calls the loyalty service.
 * - Tenant enablement: mechanics are off by default; merchants opt in through
 *   a future settings screen.
 *
 * Phase 1 ships NO gamification features. This module defines:
 *   - The mechanic definition contracts
 *   - The evaluator interface
 *   - The event→mechanic dispatch interface
 *   - A no-op stub evaluator
 *
 * What is NOT here (Phase 1 non-goals):
 *   - Badge images or award UI
 *   - Leaderboard storage or API
 *   - Challenge progress persistence
 *   - Streak tracking
 *   - Mechanic definition admin screen
 */

import type { DomainEventEnvelope } from "@/lib/domain-events";
import { getLogger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Mechanic types
// ---------------------------------------------------------------------------

/** The closed set of gamification mechanic kinds Phase 1 reserves. */
export const GAMIFICATION_MECHANIC_KINDS = [
  "badge",
  "challenge",
  "streak",
  "leaderboard",
] as const;
export type GamificationMechanicKind =
  (typeof GAMIFICATION_MECHANIC_KINDS)[number];

// ---------------------------------------------------------------------------
// Mechanic definition
// ---------------------------------------------------------------------------

/**
 * A versioned gamification mechanic definition.
 *
 * Definitions are stored separately from the loyalty ledger. A merchant
 * enables specific mechanics; the evaluator reads the definition and the
 * triggering domain event, then decides whether to award loyalty value.
 */
export interface GamificationMechanic {
  id: string;
  merchantId: string;
  kind: GamificationMechanicKind;
  name: string;
  description?: string;
  /** Monotonically increasing; bumped on every rule change. */
  version: number;
  /**
   * Mechanic-specific rule configuration. Opaque here — each evaluator
   * validates its own section.
   *
   * Examples:
   *   badge:     { trigger: "POINTS_EARNED", threshold: 1000, rewardId: "..." }
   *   challenge: { events: ["POINTS_EARNED"], count: 5, windowDays: 7, bonus: 50 }
   *   streak:    { events: ["POINTS_EARNED"], daysRequired: 7, bonus: 100 }
   */
  rules: Record<string, unknown>;
  /** Loyalty value awarded when the mechanic fires (unit matches program type). */
  awardAmount: number;
  /** ISO-8601 or null — null means no expiry. */
  validFrom?: string;
  validUntil?: string;
  /** Max times this mechanic can fire per customer. null = unlimited. */
  maxAwardsPerCustomer?: number;
  /** Max times this mechanic can fire globally per merchant. null = unlimited. */
  maxAwardsTotal?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Evaluation context
// ---------------------------------------------------------------------------

/**
 * Context passed to the evaluator when a domain event fires.
 *
 * The evaluator uses this — not the database — to decide whether to award.
 * It calls back into the loyalty service (passed separately) if an award
 * should be made.
 */
export interface GamificationEvaluationContext {
  mechanic: GamificationMechanic;
  event: DomainEventEnvelope;
  /**
   * How many times this mechanic has already fired for this customer.
   * The evaluator checks this against `maxAwardsPerCustomer`.
   */
  priorAwardsForCustomer: number;
  /**
   * How many times this mechanic has fired globally for this merchant.
   * The evaluator checks this against `maxAwardsTotal`.
   */
  priorAwardsTotal: number;
}

// ---------------------------------------------------------------------------
// Award decision
// ---------------------------------------------------------------------------

export type GamificationDecision =
  | { award: false; reason: string }
  | {
      award: true;
      /** Amount to pass to the loyalty transaction service. */
      amount: number;
      reason: string;
      /**
       * Idempotency key for the loyalty transaction so a double-evaluation
       * of the same event + mechanic cannot award twice.
       */
      idempotencyKey: string;
    };

// ---------------------------------------------------------------------------
// Evaluator interface
// ---------------------------------------------------------------------------

/**
 * Contract for mechanic-specific evaluators.
 *
 * Each mechanic kind has its own evaluator. The evaluator decides whether the
 * domain event satisfies the mechanic's rules and returns a decision. It does
 * NOT write to the loyalty ledger — that is the caller's responsibility.
 */
export interface GamificationMechanicEvaluator {
  readonly kind: GamificationMechanicKind;

  /**
   * Evaluate whether the event satisfies this mechanic and return an award
   * decision. Must not throw — a throwing evaluator returns `award: false`.
   */
  evaluate(context: GamificationEvaluationContext): Promise<GamificationDecision>;
}

// ---------------------------------------------------------------------------
// Dispatch interface
// ---------------------------------------------------------------------------

/**
 * The gamification dispatcher consumes domain events from the outbox and
 * routes them to registered evaluators.
 *
 * Rules:
 *   1. The dispatcher only reads loyalty data — it never writes ledger rows.
 *   2. For every `award: true` decision it calls the loyalty transaction
 *      service with the mechanic's `idempotencyKey` to prevent double-award.
 *   3. Each evaluation is tenant-scoped — a mechanic defined for Merchant A
 *      cannot fire for Merchant B's events.
 *   4. The dispatcher records a `gamification_award` event (future table)
 *      for audit and progress tracking; it must not alter the outbox row.
 */
export interface GamificationDispatcher {
  /**
   * Dispatch an outbox event to all enabled mechanics for the event's tenant.
   * Returns the number of awards made.
   */
  dispatch(event: DomainEventEnvelope): Promise<number>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const evaluators = new Map<
  GamificationMechanicKind,
  GamificationMechanicEvaluator
>();

/** Register a mechanic evaluator (called during bootstrap). */
export function registerGamificationEvaluator(
  evaluator: GamificationMechanicEvaluator,
): void {
  evaluators.set(evaluator.kind, evaluator);
  getLogger().info({ kind: evaluator.kind }, "gamification evaluator registered");
}

/** Get the evaluator for a mechanic kind. */
export function getGamificationEvaluator(
  kind: GamificationMechanicKind,
): GamificationMechanicEvaluator | undefined {
  return evaluators.get(kind);
}

// ---------------------------------------------------------------------------
// No-op stub dispatcher (Phase 1)
// ---------------------------------------------------------------------------

/**
 * Phase 1 stub dispatcher: logs the event but makes no awards.
 * Tenant enablement check is included to demonstrate the contract.
 */
export class StubGamificationDispatcher implements GamificationDispatcher {
  async dispatch(event: DomainEventEnvelope): Promise<number> {
    getLogger().debug(
      {
        eventType: event.eventType,
        merchantId: event.merchantId,
        aggregateId: event.aggregateId,
      },
      "gamification dispatcher: no mechanics enabled (Phase 1 stub)",
    );
    // Phase 1: no mechanics are enabled; return 0 awards.
    return 0;
  }
}

let _dispatcher: GamificationDispatcher = new StubGamificationDispatcher();

/** Install the real dispatcher (called during bootstrap). */
export function setGamificationDispatcher(d: GamificationDispatcher): void {
  _dispatcher = d;
}

/** Dispatch an event through the active dispatcher. */
export async function dispatchGamificationEvent(
  event: DomainEventEnvelope,
): Promise<number> {
  try {
    return await _dispatcher.dispatch(event);
  } catch (error) {
    getLogger().error(
      {
        err: error instanceof Error ? error.message : String(error),
        eventType: event.eventType,
        merchantId: event.merchantId,
      },
      "gamification dispatcher error (suppressed)",
    );
    return 0;
  }
}
