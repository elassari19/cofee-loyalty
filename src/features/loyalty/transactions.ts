import type { EntityManager } from "typeorm";

import type { AuthContext } from "@/auth/context";
import { requireCapability } from "@/auth/guard";
import { requireTenant } from "@/auth/tenant";
import { resolveIdentityToken } from "@/features/customers/service";
import { getDb } from "@/db/connection";
import type { LedgerType, LoyaltyUnit } from "@/db/entities/enums";
import {
  CustomerProfileEntity,
  type CustomerProfile,
} from "@/db/entities/customer-profile.entity";
import {
  LoyaltyMembershipEntity,
  type LoyaltyMembership,
} from "@/db/entities/loyalty-membership.entity";
import type { LoyaltyProgram } from "@/db/entities/loyalty-program.entity";
import {
  LoyaltyTransactionEntity,
  type LoyaltyTransaction,
} from "@/db/entities/loyalty-transaction.entity";
import { MerchantEntity, type Merchant } from "@/db/entities/merchant.entity";
import { recordAdjustment, recordEarn } from "@/db/ledger";
import { enqueueDomainEvent } from "@/lib/domain-events";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type FieldIssue,
} from "@/lib/errors";
import { formatMoney } from "@/lib/format";

import {
  calculateEarn,
  unitLabel,
  type EarnResult,
  type ProgramRules,
} from "./calculation";
import { findProgram } from "./service";
import {
  isConfigurationValid,
  MAX_ADJUSTMENT_DELTA,
  MAX_REASON_LENGTH,
} from "./schemas";

/**
 * Staff transaction service (checklist §8) — the application-layer authority
 * over the append-only ledger in `src/db/ledger.ts`.
 *
 * Every balance-changing operation a human can trigger goes through this
 * module, and every one of them:
 *
 * 1. **Resolves the tenant from the session** (`requireTenant`) and checks the
 *    caller's capability again, so a crafted direct call cannot reach a write
 *    the action guard would have refused.
 * 2. **Re-validates the world it depends on** — merchant not suspended, member
 *    found *in this tenant*, membership active, program active with a readable
 *    rule set — because a page that loaded a second ago may be stale.
 * 3. **Calculates from the stored rules** (`./calculation`), never from a
 *    number the client sent back. The preview the cashier confirmed and the
 *    entry that lands are the same function's output.
 * 4. **Appends once** under an idempotency key, so a double-click, a flaky
 *    network or a retried POS post cannot award twice.
 * 5. **Enqueues its outbox event in the same transaction** (§8 bullet 12) —
 *    no event exists for a balance that rolled back, none is missing for one
 *    that committed.
 *
 * Redemptions and reward burns append through the same ledger API
 * (`recordRedemption`, `recordRewardRedemption`) from §9; expiry will do the
 * same. This module owns purchase entry, manual adjustment and reversal.
 */

// ---------------------------------------------------------------------------
// Groups (shared by the register, staff history and merchant history views)
// ---------------------------------------------------------------------------

export type TransactionGroup = "earn" | "redeem" | "adjustment";

const GROUP_TYPES: Record<TransactionGroup, readonly LedgerType[]> = {
  earn: ["POINTS_EARNED", "STAMP_EARNED"],
  redeem: ["POINTS_REDEEMED", "STAMP_REDEEMED", "REWARD_REDEEMED"],
  adjustment: ["POINTS_ADJUSTED", "STAMP_ADJUSTED"],
};

export const TRANSACTION_GROUPS = [
  "earn",
  "redeem",
  "adjustment",
] as const satisfies readonly TransactionGroup[];

export const TRANSACTION_GROUP_LABELS: Record<TransactionGroup, string> = {
  earn: "Earn",
  redeem: "Redeem",
  adjustment: "Adjustment",
};

function groupOf(type: LedgerType): TransactionGroup {
  for (const [group, types] of Object.entries(GROUP_TYPES) as [
    TransactionGroup,
    readonly LedgerType[],
  ][]) {
    if (types.includes(type)) return group;
  }
  throw new ConflictError(`Unknown ledger entry type "${type}".`);
}

function typesForGroup(group: TransactionGroup): readonly LedgerType[] {
  return GROUP_TYPES[group];
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9:_-]{8,120}$/;
const EXTERNAL_REF_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;

/**
 * A `ValidationError` whose top-level message is the first issue, so a server
 * action surfaces "Enter the purchase amount." rather than a generic
 * "submitted data is invalid".
 */
function invalid(issue: FieldIssue, issues: FieldIssue[] = [issue]): never {
  throw new ValidationError(issues, issue.message);
}

function parseMembershipId(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!UUID_PATTERN.test(id)) {
    invalid({ path: "membershipId", message: "Select a member." });
  }
  return id;
}

/**
 * The cashier's "this is one submission" token. Required, so a retried POST
 * reuses the previous key instead of inventing a second award.
 */
function parseIdempotencyKey(value: unknown): string {
  const key = typeof value === "string" ? value.trim() : "";
  if (!IDEMPOTENCY_PATTERN.test(key)) {
    invalid({
      path: "idempotencyKey",
      message: "That submission could not be identified. Try again.",
    });
  }
  return key;
}

/** Optional POS/receipt reference — unique per merchant at the database. */
function parseExternalRef(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const ref = String(value).trim();
  if (!EXTERNAL_REF_PATTERN.test(ref)) {
    invalid({
      path: "externalRef",
      message: "A receipt reference may only use letters, numbers, . : _ -",
    });
  }
  return ref;
}

function parseReason(value: unknown): string {
  const reason = typeof value === "string" ? value.trim() : "";
  if (reason.length < 3) {
    invalid({
      path: "reason",
      message: "Give a reason for the adjustment (at least 3 characters).",
    });
  }
  if (reason.length > MAX_REASON_LENGTH) {
    invalid({
      path: "reason",
      message: `Keep the reason to ${MAX_REASON_LENGTH} characters or fewer.`,
    });
  }
  return reason;
}

/** Whole, non-zero, bounded signed change for a manual adjustment. */
export function parseAdjustmentDelta(value: unknown): number {
  const delta =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(delta)) {
    invalid({
      path: "amount",
      message: "Enter how much to add or remove.",
    });
  }
  if (!Number.isInteger(delta)) {
    invalid({ path: "amount", message: "Use whole units only." });
  }
  if (delta === 0) {
    invalid({
      path: "amount",
      message: "An adjustment must change the balance.",
    });
  }
  if (Math.abs(delta) > MAX_ADJUSTMENT_DELTA) {
    invalid({
      path: "amount",
      message: `An adjustment cannot move more than ${MAX_ADJUSTMENT_DELTA} at once.`,
    });
  }
  return delta;
}

// ---------------------------------------------------------------------------
// Tenant-scoped context
// ---------------------------------------------------------------------------

interface MemberContext {
  merchant: Merchant;
  membership: LoyaltyMembership;
  profile: CustomerProfile;
  program: LoyaltyProgram;
}

/**
 * Loads everything a transaction must be checked against, with every read
 * carrying the tenant predicate: a membership id belonging to another merchant
 * is "not found", never "not yours" (PRD §36).
 */
async function loadMemberContext(
  em: EntityManager,
  merchantId: string,
  membershipId: string,
): Promise<MemberContext> {
  const merchant = await em.findOneBy(MerchantEntity, { id: merchantId });
  if (!merchant) throw new NotFoundError("That store could not be found.");
  if (merchant.status === "suspended") {
    throw new ConflictError(
      "This store's account is suspended, so transactions are paused.",
    );
  }

  const membership = await em.findOne(LoyaltyMembershipEntity, {
    where: { id: membershipId, merchantId },
  });
  if (!membership) {
    throw new NotFoundError("That member was not found in this store.");
  }
  if (membership.status !== "active") {
    throw new ConflictError("This membership is closed.");
  }

  const profile = await em.findOneBy(CustomerProfileEntity, {
    id: membership.customerProfileId,
  });
  if (!profile) throw new NotFoundError("That member's profile was not found.");

  const program = await findProgram(em, merchantId);
  if (!program) {
    throw new ConflictError(
      "Set up a loyalty program before recording transactions.",
    );
  }
  if (program.status !== "active") {
    throw new ConflictError(
      "This loyalty program is not active yet — activate it before recording transactions.",
    );
  }
  if (!isConfigurationValid(program.type, program.configuration)) {
    throw new ConflictError(
      "The program rules are incomplete. Review them before recording transactions.",
    );
  }

  return { merchant, membership, profile, program };
}

function toRules(program: LoyaltyProgram): ProgramRules {
  return {
    id: program.id,
    type: program.type,
    unitName: program.unitName,
    ruleVersion: program.ruleVersion,
    configuration: program.configuration,
  };
}

// ---------------------------------------------------------------------------
// Card lookup (staff QR/token flow, checklist §8 bullet 6)
// ---------------------------------------------------------------------------

export interface MemberLookup {
  membershipId: string;
  customerProfileId: string;
  name: string;
  balance: number;
}

/**
 * Resolves a scanned/pasted `cofe://customer/<token>` payload to the member it
 * identifies *in this tenant*.
 *
 * Returns `null` for anything that does not parse or does not match — the
 * caller turns that into "no member matched that card" without revealing
 * whether a token exists elsewhere. The token itself is never echoed back.
 */
export async function lookupMemberByCard(
  auth: AuthContext,
  payload: unknown,
): Promise<MemberLookup | null> {
  requireCapability(auth, "transactions.create");
  const merchantId = requireTenant(auth);

  const resolved = await resolveIdentityToken(payload, { merchantId });
  if (!resolved) return null;
  if (resolved.membership.status !== "active") {
    throw new ConflictError("That card belongs to a closed membership.");
  }

  return {
    membershipId: resolved.membership.id,
    customerProfileId: resolved.profile.id,
    name: resolved.profile.name,
    balance: resolved.membership.balance,
  };
}

// ---------------------------------------------------------------------------
// Purchase: preview and record
// ---------------------------------------------------------------------------

export interface PurchasePreview {
  membershipId: string;
  customerName: string;
  balanceBefore: number;
  balanceAfter: number;
  programId: string;
  programName: string;
  ruleVersion: number;
  unit: LoyaltyUnit;
  unitName: string;
  amount: number;
  currency: string;
  /** Units this purchase earns — 0 when it does not qualify. */
  delta: number;
  qualified: boolean;
  /** Why nothing would be earned (null when it qualifies). */
  message: string | null;
}

export interface RecordPurchaseInput {
  membershipId: unknown;
  amount: unknown;
  currency?: unknown;
  idempotencyKey: unknown;
  externalRef?: unknown;
}

export interface PurchaseOutcome {
  entry: LoyaltyTransaction;
  /** True when this key had already been applied — nothing was written. */
  replayed: boolean;
  customerName: string;
  unit: LoyaltyUnit;
  unitName: string;
  amount: number;
  currency: string;
  delta: number;
  balance: number;
}

/**
 * What the cashier's confirm screen shows. Reads only, but runs through the
 * same context checks and the same calculation as the write, so the preview
 * cannot disagree with what `recordPurchase` will do a moment later.
 */
export async function previewPurchase(
  em: EntityManager,
  auth: AuthContext,
  input: { membershipId: unknown; amount: unknown; currency?: unknown },
): Promise<PurchasePreview> {
  requireCapability(auth, "transactions.create");
  const merchantId = requireTenant(auth);
  const context = await loadMemberContext(
    em,
    merchantId,
    parseMembershipId(input.membershipId),
  );

  const earned = calculateEarn({
    program: toRules(context.program),
    amount: input.amount,
    currency: input.currency,
    merchantCurrency: context.merchant.currency,
  });

  return {
    membershipId: context.membership.id,
    customerName: context.profile.name,
    balanceBefore: context.membership.balance,
    balanceAfter: context.membership.balance + earned.delta,
    programId: context.program.id,
    programName: context.program.name,
    ruleVersion: context.program.ruleVersion,
    unit: earned.unit,
    unitName: earned.unitName,
    amount: earned.amount,
    currency: earned.currency,
    delta: earned.delta,
    qualified: earned.qualified,
    message: earned.message,
  };
}

/**
 * Records one purchase: calculate → append → enqueue, all in the caller's
 * transaction. A replayed key returns the original entry without touching the
 * balance or the outbox.
 */
export async function recordPurchase(
  em: EntityManager,
  auth: AuthContext,
  input: RecordPurchaseInput,
): Promise<PurchaseOutcome> {
  requireCapability(auth, "transactions.create");
  const merchantId = requireTenant(auth);
  const membershipId = parseMembershipId(input.membershipId);
  const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
  const externalRef = parseExternalRef(input.externalRef);

  const context = await loadMemberContext(em, merchantId, membershipId);
  const earned = calculateEarn({
    program: toRules(context.program),
    amount: input.amount,
    currency: input.currency,
    merchantCurrency: context.merchant.currency,
  });
  if (!earned.qualified) {
    invalid({
      path: "amount",
      message: earned.message ?? "This purchase does not earn anything.",
    });
  }

  const replay = await em.findOne(LoyaltyTransactionEntity, {
    where: { merchantId, idempotencyKey },
  });
  if (replay) return resolveReplay(em, replay, context, earned);

  const entry = await recordEarn(em, {
    merchantId,
    membershipId,
    unit: earned.unit,
    delta: earned.delta,
    programId: earned.programId,
    ruleVersion: earned.ruleVersion,
    purchaseAmount: earned.amount,
    currency: earned.currency,
    createdBy: auth.userId,
    idempotencyKey,
    externalRef,
    metadata: { source: "register" },
  });

  await enqueueTransactionEvent(em, {
    merchantId,
    entry,
    source: "register",
  });

  return {
    entry,
    replayed: false,
    customerName: context.profile.name,
    unit: earned.unit,
    unitName: earned.unitName,
    amount: earned.amount,
    currency: earned.currency,
    delta: earned.delta,
    balance: await readBalance(em, membershipId),
  };
}

/**
 * Same key again: return the original outcome, but only when it *is* the
 * original submission. A key reused for a different member or amount is a
 * client bug (or a replay attack) and must not silently return someone else's
 * entry.
 */
async function resolveReplay(
  em: EntityManager,
  entry: LoyaltyTransaction,
  context: MemberContext,
  earned: EarnResult,
): Promise<PurchaseOutcome> {
  const samePurchase =
    entry.membershipId === context.membership.id &&
    Number(entry.purchaseAmount ?? -1) === earned.amount;
  if (!samePurchase) {
    throw new ConflictError(
      "That submission reference was already used for a different purchase.",
    );
  }
  return {
    entry,
    replayed: true,
    customerName: context.profile.name,
    unit: earned.unit,
    unitName: earned.unitName,
    amount: earned.amount,
    currency: earned.currency,
    delta: earned.delta,
    balance: await readBalance(em, context.membership.id),
  };
}

// ---------------------------------------------------------------------------
// Manual adjustment (owner/manager only, checklist §8 bullet 7)
// ---------------------------------------------------------------------------

export interface AdjustBalanceInput {
  membershipId: unknown;
  delta: unknown;
  reason: unknown;
  idempotencyKey: unknown;
}

export interface AdjustmentOutcome {
  entry: LoyaltyTransaction;
  replayed: boolean;
  customerName: string;
  unit: LoyaltyUnit;
  unitName: string;
  delta: number;
  balance: number;
}

/**
 * Adds or removes value with a mandatory reason, recorded as an ordinary
 * `*_ADJUSTED` ledger entry — the balance is never edited in place.
 *
 * Capability (`transactions.adjust`) is checked here as well as in the action:
 * this function is a public API, and "owner/manager only" must hold even for a
 * caller that skipped the guard.
 */
export async function adjustBalance(
  em: EntityManager,
  auth: AuthContext,
  input: AdjustBalanceInput,
): Promise<AdjustmentOutcome> {
  requireCapability(auth, "transactions.adjust");
  const merchantId = requireTenant(auth);
  const membershipId = parseMembershipId(input.membershipId);
  const delta = parseAdjustmentDelta(input.delta);
  const reason = parseReason(input.reason);
  const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);

  const context = await loadMemberContext(em, merchantId, membershipId);
  const unit = context.program.type;

  const replay = await em.findOne(LoyaltyTransactionEntity, {
    where: { merchantId, idempotencyKey },
  });
  if (replay) {
    if (replay.membershipId !== membershipId || replay.delta !== delta) {
      throw new ConflictError(
        "That submission reference was already used for a different adjustment.",
      );
    }
    return {
      entry: replay,
      replayed: true,
      customerName: context.profile.name,
      unit,
      unitName: unitLabel(toRules(context.program)),
      delta: replay.delta,
      balance: await readBalance(em, membershipId),
    };
  }

  const entry = await recordAdjustment(em, {
    merchantId,
    membershipId,
    unit,
    delta,
    reason,
    createdBy: auth.userId,
    idempotencyKey,
    metadata: { source: "manual" },
  });
  await enqueueTransactionEvent(em, { merchantId, entry, source: "manual" });

  return {
    entry,
    replayed: false,
    customerName: context.profile.name,
    unit,
    unitName: unitLabel(toRules(context.program)),
    delta,
    balance: await readBalance(em, membershipId),
  };
}

// ---------------------------------------------------------------------------
// Reversal
// ---------------------------------------------------------------------------

export interface ReverseEntryInput {
  entryId: unknown;
  reason: unknown;
  idempotencyKey: unknown;
}

export interface ReversalOutcome {
  original: LoyaltyTransaction;
  reversal: LoyaltyTransaction;
  balance: number;
}

/**
 * Corrects a mistaken earn or adjustment by appending the opposite entry —
 * never by editing the original row (which the database forbids anyway).
 *
 * Redemptions are deliberately excluded: undoing value the customer already
 * spent is a redemption-lifecycle operation (`§9`), not a manual correction.
 */
export async function reverseLedgerEntry(
  em: EntityManager,
  auth: AuthContext,
  input: ReverseEntryInput,
): Promise<ReversalOutcome> {
  requireCapability(auth, "transactions.adjust");
  const merchantId = requireTenant(auth);
  const entryId =
    typeof input.entryId === "string" && UUID_PATTERN.test(input.entryId.trim())
      ? input.entryId.trim()
      : invalid({ path: "entryId", message: "That entry could not be found." });
  const reason = parseReason(input.reason);
  const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);

  const original = await em.findOne(LoyaltyTransactionEntity, {
    where: { id: entryId, merchantId },
  });
  if (!original) {
    throw new NotFoundError("That ledger entry was not found.");
  }
  if (original.type.endsWith("_REDEEMED")) {
    throw new ConflictError(
      "Redemptions are reversed through the redemption flow, not by hand.",
    );
  }

  const replay = await em.findOne(LoyaltyTransactionEntity, {
    where: { merchantId, idempotencyKey },
  });
  if (replay) {
    if (replay.reason !== reason || replay.delta !== -original.delta) {
      throw new ConflictError(
        "That submission reference was already used for a different reversal.",
      );
    }
    return {
      original,
      reversal: replay,
      balance: await readBalance(em, original.membershipId),
    };
  }

  const reversal = await recordAdjustment(em, {
    merchantId,
    membershipId: original.membershipId,
    unit: original.unit,
    delta: -original.delta,
    reason,
    createdBy: auth.userId,
    idempotencyKey,
    metadata: { source: "reversal", reverses: original.id },
  });
  await enqueueTransactionEvent(em, {
    merchantId,
    entry: reversal,
    source: "reversal",
  });

  return {
    original,
    reversal,
    balance: await readBalance(em, original.membershipId),
  };
}

// ---------------------------------------------------------------------------
// Histories and pickers
// ---------------------------------------------------------------------------

export interface TenantTransactionRow {
  id: string;
  createdAt: Date;
  type: LedgerType;
  group: TransactionGroup;
  delta: number;
  unit: LoyaltyUnit;
  /** Signed display value, e.g. `+45 points`. */
  amountLabel: string;
  customerName: string;
  /** Purchase amount the award came from, when there was one. */
  purchaseAmount: number | null;
  currency: string | null;
  reason: string | null;
  detail: string;
  /** Display name of the staff/owner who recorded it. */
  recordedBy: string | null;
}

interface TenantTransactionSqlRow {
  id: string;
  created_at: Date;
  type: LedgerType;
  unit: LoyaltyUnit;
  delta: number;
  purchase_amount: number | null;
  currency: string | null;
  reason: string | null;
  reward_name: string | null;
  customer_name: string;
  actor_name: string | null;
}

/**
 * The merchant's ledger history, newest first.
 *
 * The tenant predicate is in SQL with no way to widen it from the client.
 * The projection is deliberately field-limited: names, amounts, reason and
 * actor — no idempotency keys, no raw metadata, no identity tokens.
 */
export async function listTenantTransactions(
  auth: AuthContext,
  options: { group?: TransactionGroup; limit?: number } = {},
): Promise<TenantTransactionRow[]> {
  requireCapability(auth, "transactions.read");
  const merchantId = requireTenant(auth);
  const em = (await getDb()).manager;
  const types = options.group ? [...typesForGroup(options.group)] : null;

  const rows = await em.query<TenantTransactionSqlRow[]>(
    `SELECT t.id, t.created_at, t.type, t.unit, t.delta, t.purchase_amount,
            t.currency, t.reason, r.name AS reward_name,
            cp.name AS customer_name, u.name AS actor_name
       FROM loyalty_transaction t
       JOIN customer_profile cp ON cp.id = t.customer_profile_id
       LEFT JOIN reward r ON r.id = t.reward_id
       LEFT JOIN "user" u ON u.id = t.created_by
      WHERE t.merchant_id = $1
        AND ($2::text[] IS NULL OR t.type = ANY($2::text[]))
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $3`,
    [merchantId, types, options.limit ?? 200],
  );

  const program = await findProgram(em, merchantId);
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    type: row.type,
    group: groupOf(row.type),
    delta: row.delta,
    unit: row.unit,
    amountLabel: signedAmount(
      row.delta,
      program && program.type === row.unit
        ? unitLabel(program)
        : row.unit === "POINTS"
          ? "points"
          : "stamps",
    ),
    customerName: row.customer_name,
    purchaseAmount:
      row.purchase_amount === null ? null : Number(row.purchase_amount),
    currency: row.currency,
    reason: row.reason,
    detail: describeEntry(row),
    recordedBy: row.actor_name,
  }));
}

function describeEntry(row: TenantTransactionSqlRow): string {
  if (row.type === "REWARD_REDEEMED")
    return row.reward_name ?? "Reward redeemed";
  if (row.type === "POINTS_ADJUSTED" || row.type === "STAMP_ADJUSTED") {
    return row.reason?.trim() || "Balance adjusted";
  }
  if (row.type.endsWith("_REDEEMED")) return "Value redeemed";
  return row.purchase_amount === null
    ? "Value earned"
    : `Purchase · ${formatMoney(Number(row.purchase_amount), row.currency ?? "USD")}`;
}

function signedAmount(delta: number, unit: string): string {
  const sign = delta < 0 ? "-" : "+";
  return `${sign}${new Intl.NumberFormat("en-US").format(Math.abs(delta))} ${unit}`;
}

export interface MemberOption {
  membershipId: string;
  name: string;
  balance: number;
}

/**
 * The register's member picker: active memberships only, names for display.
 * Used as the fallback when a card cannot be scanned — never as the primary
 * identification path.
 */
export async function listMemberOptions(
  auth: AuthContext,
  options: { limit?: number } = {},
): Promise<MemberOption[]> {
  requireCapability(auth, "transactions.create");
  const merchantId = requireTenant(auth);
  const em = (await getDb()).manager;

  const rows = await em.query<
    Array<{ membership_id: string; name: string; balance: number }>
  >(
    `SELECT lm.id AS membership_id, cp.name, lm.balance
       FROM loyalty_membership lm
       JOIN customer_profile cp ON cp.id = lm.customer_profile_id
      WHERE lm.merchant_id = $1
        AND lm.status = 'active'
      ORDER BY cp.name ASC, lm.id ASC
      LIMIT $2`,
    [merchantId, options.limit ?? 300],
  );

  return rows.map((row) => ({
    membershipId: row.membership_id,
    name: row.name,
    balance: row.balance,
  }));
}

// ---------------------------------------------------------------------------
// Shared internals
// ---------------------------------------------------------------------------

async function readBalance(
  em: EntityManager,
  membershipId: string,
): Promise<number> {
  const membership = await em.findOneBy(LoyaltyMembershipEntity, {
    id: membershipId,
  });
  if (!membership) throw new NotFoundError("That membership is gone.");
  return membership.balance;
}

/**
 * The outbox row, written inside the same transaction as the ledger entry.
 * The key is derived from the entry id: a replayed submission never enqueues
 * a second event for the same row.
 *
 * Exported for the redemption settlement path (§9): an expiry refund is a
 * ledger entry like any other and publishes the same way.
 */
export async function enqueueTransactionEvent(
  em: EntityManager,
  input: {
    merchantId: string;
    entry: LoyaltyTransaction;
    source: string;
  },
): Promise<void> {
  const { entry } = input;
  await enqueueDomainEvent(em, {
    merchantId: input.merchantId,
    eventType: "loyalty.transaction.created",
    aggregateType: "loyalty_transaction",
    aggregateId: entry.id,
    idempotencyKey: `loyalty.transaction.created:${entry.id}`,
    payload: {
      source: input.source,
      type: entry.type,
      unit: entry.unit,
      delta: entry.delta,
      membershipId: entry.membershipId,
      customerProfileId: entry.customerProfileId,
      programId: entry.programId,
      ruleVersion: entry.ruleVersion,
      purchaseAmount:
        entry.purchaseAmount === null ? null : Number(entry.purchaseAmount),
      currency: entry.currency,
      createdBy: entry.createdBy,
      reason: entry.reason,
    },
  });
}
