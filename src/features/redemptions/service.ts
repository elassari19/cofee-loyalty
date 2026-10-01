import { randomUUID } from "node:crypto";
import { In, type EntityManager } from "typeorm";

import type { AuthContext } from "@/auth/context";
import { requireCapability } from "@/auth/guard";
import { requireTenant } from "@/auth/tenant";
import { findProgram } from "@/features/loyalty/service";
import { enqueueTransactionEvent } from "@/features/loyalty/transactions";
import type { LoyaltyType, RedemptionStatus } from "@/db/entities/enums";
import { CustomerProfileEntity } from "@/db/entities/customer-profile.entity";
import {
  LoyaltyMembershipEntity,
  type LoyaltyMembership,
} from "@/db/entities/loyalty-membership.entity";
import { RewardEntity } from "@/db/entities/reward.entity";
import {
  RewardRedemptionEntity,
  type RewardRedemption,
} from "@/db/entities/reward-redemption.entity";
import { recordAdjustment, recordRewardRedemption } from "@/db/ledger";
import { enqueueDomainEvent } from "@/lib/domain-events";
import { getEnv } from "@/lib/env";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type FieldIssue,
} from "@/lib/errors";

import {
  formatRedemptionCode,
  generateRedemptionCode,
  hashRedemptionCode,
  parseRedemptionCode,
} from "./code";

/**
 * Redemption issuance, verification and completion (checklist §9, PRD §19/§20).
 *
 * The lifecycle, and the money question behind each step:
 *
 * ```text
 * customer: issue ──► ISSUED ──(value reserved, ledger −cost)──┐
 * cashier:  verify ──► VERIFIED   (no value moves: a read-only  │
 * cashier:  redeem ──► REDEEMED   check that must not consume)  │
 * nobody:   TTL passes ──► EXPIRED (+cost returned, counter ────┘
 *                               freed — settlement, below)
 * ```
 *
 * Design decisions worth defending:
 *
 * 1. **Value is reserved when the code is minted.** The `REWARD_REDEEMED`
 *    ledger entry and the `reward_redemption` row are written together under
 *    the membership row lock, so the balance a customer is shown as "held for
 *    your code" really is held: no other redemption, adjustment or register
 *    entry can spend it while the code is live. Completing a verified code
 *    therefore can never fail for lack of points — the counter's worst day is
 *    "this code expired", never "we cannot honour it".
 * 2. **Verify never touches the ledger.** Verification flips `ISSUED →
 *    VERIFIED` and stamps *who looked at it*; only completion flips
 *    `VERIFIED → REDEEMED`. Checking a code can therefore never consume it
 *    (§9 bullet 6).
 *    - **Settlement returns reserved value** (expiry, or the customer
 *      replacing their own code): a normal `*_ADJUSTED` entry of `+cost` with
 *      a mandatory reason, the counter projection released, all inside the
 *      same transaction. It is applied at most once — a conditional update
 *      out of the live statuses plus an idempotency key derived from the
 *      redemption id.
 * 3. **Completion is idempotent**: the status flip is conditional
 *    (`WHERE status = 'VERIFIED'`), so a concurrent double submit resolves to
 *    one winner and one replay; nothing is written twice and no outbox event
 *    is enqueued twice (the business key is the redemption id).
 * 4. **Every read carries the tenant predicate**: a code or reward id from
 *    another merchant is "not found" (PRD §36), never "not yours".
 * 5. **The code itself is opaque and hashed** — see `./code.ts`. Nothing in
 *    this module ever logs, audits or returns the clear-text value except the
 *    single issue response that hands it to the customer's own screen.
 *
 * Lock order, used by every path here so concurrent flows queue instead of
 * deadlocking: `reward_redemption` → `loyalty_membership` → `reward`.
 */

/** Statuses that still hold reserved value. */
const LIVE_STATUSES: RedemptionStatus[] = ["ISSUED", "VERIFIED"];

const SETTLEMENT_REASONS: Record<"EXPIRED" | "CANCELLED", string> = {
  EXPIRED: "Redemption code expired",
  CANCELLED: "Redemption code replaced",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(issue: FieldIssue): never {
  throw new ValidationError([issue], issue.message);
}

function parseId(value: unknown, path: string, message: string): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!UUID_PATTERN.test(id)) invalid({ path, message });
  return id;
}

/**
 * Staff-side guard for the verify/redeem half of the flow. `rewards.redeem`
 * is what the capability matrix grants, but customers hold it too — for
 * *their own* issuance — so a customer may never verify or complete: the
 * verifier is a different person, and §9 bullet 8 records who that was.
 */
function requireCounterAccess(auth: AuthContext): string {
  requireCapability(auth, "rewards.redeem");
  if (auth.role === "CUSTOMER") {
    throw new ForbiddenError(
      "Codes are verified at the counter, not from the customer portal.",
    );
  }
  return requireTenant(auth);
}

/** The member's own active membership at this merchant, resolved without a lock. */
async function findOwnMembershipId(
  em: EntityManager,
  userId: string,
  merchantId: string,
): Promise<string | null> {
  const rows = await em.query<Array<{ id: string }>>(
    `SELECT lm.id
       FROM loyalty_membership lm
       JOIN customer_profile cp ON cp.id = lm.customer_profile_id
      WHERE cp.user_id = $1
        AND lm.merchant_id = $2
        AND lm.status = 'active'`,
    [userId, merchantId],
  );
  return rows[0]?.id ?? null;
}

/** One membership row, tenant-checked and locked for the rest of the transaction. */
async function lockMembership(
  em: EntityManager,
  merchantId: string,
  membershipId: string,
): Promise<LoyaltyMembership> {
  const membership = await em
    .createQueryBuilder()
    .select("lm")
    .from(LoyaltyMembershipEntity, "lm")
    .where("lm.id = :id AND lm.merchantId = :merchantId", {
      id: membershipId,
      merchantId,
    })
    .setLock("pessimistic_write")
    .getOne();
  if (!membership) {
    throw new NotFoundError("That membership was not found in this store.");
  }
  if (membership.status !== "active") {
    throw new ConflictError("This membership is closed.");
  }
  return membership;
}

/** One redemption row inside the tenant, locked. */
async function lockRedemption(
  em: EntityManager,
  merchantId: string,
  redemptionId: string,
): Promise<RewardRedemption> {
  const redemption = await em
    .createQueryBuilder()
    .select("r")
    .from(RewardRedemptionEntity, "r")
    .where("r.id = :id AND r.merchantId = :merchantId", {
      id: redemptionId,
      merchantId,
    })
    .setLock("pessimistic_write")
    .getOne();
  if (!redemption) {
    throw new NotFoundError("No redemption matched that code.");
  }
  return redemption;
}

/** The program's own name for the dimension, falling back to a plain label. */
async function resolveUnitLabel(
  em: EntityManager,
  merchantId: string,
  unit: LoyaltyType,
): Promise<string> {
  const program = await findProgram(em, merchantId);
  if (program && program.type === unit && program.unitName?.trim()) {
    return program.unitName.trim();
  }
  return unit === "POINTS" ? "points" : "stamps";
}

/**
 * Hands back the reserved value and closes the code — the single place that
 * ever reverses a reservation.
 *
 * The caller must hold the redemption row lock (every path locks before
 * calling). The conditional update is the second line of defence: a code that
 * was completed, cancelled or expired by someone else is left alone and no
 * refund is issued.
 */
async function settleRedemption(
  em: EntityManager,
  redemption: RewardRedemption,
  to: Extract<RedemptionStatus, "EXPIRED" | "CANCELLED">,
  actorId: string | null,
): Promise<boolean> {
  const now = new Date();
  const updated = await em.update(
    RewardRedemptionEntity,
    { id: redemption.id, status: In(LIVE_STATUSES) },
    { status: to, updatedAt: now },
  );
  if (!updated.affected) return false;

  redemption.status = to;
  redemption.updatedAt = now;

  const entry = await recordAdjustment(em, {
    merchantId: redemption.merchantId,
    membershipId: redemption.membershipId,
    unit: redemption.unit,
    delta: redemption.cost,
    reason: SETTLEMENT_REASONS[to],
    rewardId: redemption.rewardId,
    redemptionId: redemption.id,
    createdBy: actorId,
    idempotencyKey: `reward.redemption.settled:${redemption.id}`,
    metadata: { source: "redemption_settlement", settlement: to },
  });
  await enqueueTransactionEvent(em, {
    merchantId: redemption.merchantId,
    entry,
    source: "redemption_settlement",
  });

  // Free the redemption-limit slot this code was holding.
  await em.update(
    RewardEntity,
    { id: redemption.rewardId, merchantId: redemption.merchantId },
    { redemptionCount: () => `GREATEST("redemption_count" - 1, 0)` },
  );
  return true;
}

/** Expires one due code (and only a due one), returning its value once. */
async function expireIfDue(
  em: EntityManager,
  redemption: RewardRedemption,
  actorId: string | null,
): Promise<boolean> {
  if (!LIVE_STATUSES.includes(redemption.status)) return false;
  if (!redemption.expiresAt || redemption.expiresAt.getTime() > Date.now()) {
    return false;
  }
  return settleRedemption(em, redemption, "EXPIRED", actorId);
}

// ---------------------------------------------------------------------------
// Issue (customer, checklist §9 bullets 4–5, PRD §19)
// ---------------------------------------------------------------------------

export interface IssueInput {
  rewardId: unknown;
}

export interface IssuedRedemption {
  redemptionId: string;
  membershipId: string;
  /**
   * The clear-text code, returned **once** to the customer's own screen.
   * Only its SHA-256 hash is stored, so it cannot be shown again — generating
   * a new code replaces (and refunds) this one.
   */
  code: string;
  formattedCode: string;
  rewardId: string;
  rewardName: string;
  cost: number;
  unit: LoyaltyType;
  unitName: string;
  expiresAt: Date;
  balance: number;
  /** True when this issue replaced a still-live code for the same reward. */
  replacedPreviousCode: boolean;
}

/**
 * Mints a redemption code for the caller's own membership: validates
 * membership, tenant, reward status/expiration, balance and usage limits in
 * one transaction, then reserves the value and returns the code.
 */
export async function issueRedemption(
  em: EntityManager,
  auth: AuthContext,
  input: IssueInput,
): Promise<IssuedRedemption> {
  requireCapability(auth, "rewards.redeem");
  if (auth.role !== "CUSTOMER") {
    throw new ForbiddenError(
      "Codes are generated by the customer on their own device.",
    );
  }
  const merchantId = requireTenant(auth);
  const rewardId = parseId(
    input.rewardId,
    "rewardId",
    "That reward could not be found.",
  );

  const now = new Date();
  const reward = await em.findOne(RewardEntity, {
    where: { id: rewardId, merchantId },
  });
  if (!reward) throw new NotFoundError("That reward is not available.");
  if (reward.status !== "active") {
    throw new ConflictError("This reward is paused right now.");
  }
  if (reward.expiresAt && reward.expiresAt.getTime() <= now.getTime()) {
    throw new ConflictError("This reward has expired.");
  }
  if (
    reward.redemptionLimit !== null &&
    reward.redemptionCount >= reward.redemptionLimit
  ) {
    throw new ConflictError("This reward has reached its redemption limit.");
  }
  const unitName = await resolveUnitLabel(em, merchantId, reward.unit);

  const membershipId = await findOwnMembershipId(em, auth.userId, merchantId);
  if (!membershipId) {
    throw new NotFoundError(
      "Open your membership card with this store before redeeming.",
    );
  }

  // At most one live code per member and reward: a fresh issue settles the
  // previous one (refunding it) instead of leaving a second, competing code.
  const dueForSettlement = (
    await em.find(RewardRedemptionEntity, {
      where: {
        merchantId,
        membershipId,
        rewardId,
        status: In(LIVE_STATUSES),
      },
    })
  ).filter(
    (row) => row.expiresAt === null || row.expiresAt.getTime() > now.getTime(),
  );
  for (const previous of dueForSettlement) {
    const locked = await lockRedemption(em, merchantId, previous.id);
    await settleRedemption(em, locked, "CANCELLED", auth.userId);
  }

  const membership = await lockMembership(em, merchantId, membershipId);
  if (membership.balance < reward.cost) {
    throw new ConflictError(
      `You need ${reward.cost - membership.balance} more ${unitName} for this reward.`,
    );
  }

  // Code + row + counter + ledger commit together: a failure anywhere leaves
  // no half-issued code and no stray reservation.
  let code = "";
  let redemptionId = "";
  for (let attempt = 0; attempt < 3 && !redemptionId; attempt++) {
    const candidate = generateRedemptionCode();
    const codeHash = hashRedemptionCode(candidate);
    const clash = await em.findOneBy(RewardRedemptionEntity, { codeHash });
    if (clash) continue;
    redemptionId = randomUUID();
    code = candidate;
    await em.insert(RewardRedemptionEntity, {
      id: redemptionId,
      merchantId,
      membershipId,
      rewardId,
      unit: reward.unit,
      cost: reward.cost,
      codeHash,
      status: "ISSUED",
      expiresAt: codeExpiry(now, reward.expiresAt),
      requestedBy: auth.userId,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (!redemptionId) {
    throw new ConflictError("Could not mint a fresh code — please try again.");
  }

  const claimed = await em
    .createQueryBuilder()
    .update(RewardEntity)
    .set({ redemptionCount: () => `"redemption_count" + 1` })
    .where(
      `id = :id AND merchant_id = :merchantId
       AND (redemption_limit IS NULL OR redemption_count < redemption_limit)`,
      { id: rewardId, merchantId },
    )
    .execute();
  if (claimed.affected !== 1) {
    throw new ConflictError(
      "Someone claimed the last available redemption of this reward.",
    );
  }

  const entry = await recordRewardRedemption(em, {
    merchantId,
    membershipId,
    unit: reward.unit,
    delta: -reward.cost,
    rewardId,
    redemptionId,
    createdBy: auth.userId,
    idempotencyKey: `reward.redemption:${redemptionId}`,
    metadata: { source: "customer_code" },
  });
  await enqueueTransactionEvent(em, {
    merchantId,
    entry,
    source: "customer_code",
  });

  const settledPreviousCode = dueForSettlement.length > 0;
  const issued = await em.findOneBy(RewardRedemptionEntity, {
    id: redemptionId,
  });
  const current = await em.findOneBy(LoyaltyMembershipEntity, {
    id: membershipId,
  });
  if (!issued || !current) {
    throw new ConflictError("The code could not be read back.");
  }

  return {
    redemptionId,
    membershipId,
    code,
    formattedCode: formatRedemptionCode(code),
    rewardId,
    rewardName: reward.name,
    cost: reward.cost,
    unit: reward.unit,
    unitName,
    expiresAt: issued.expiresAt ?? now,
    balance: current.balance,
    replacedPreviousCode: settledPreviousCode,
  };
}

/**
 * The code's deadline: the shorter of the configured TTL and the reward's own
 * expiry, so a code can never outlive the reward it was minted for.
 */
function codeExpiry(now: Date, rewardExpiresAt: Date | null): Date {
  const ttlMs = getEnv().REDEMPTION_CODE_TTL_MINUTES * 60_000;
  const ttl = new Date(now.getTime() + ttlMs);
  if (rewardExpiresAt && rewardExpiresAt.getTime() < ttl.getTime()) {
    return rewardExpiresAt;
  }
  return ttl;
}

// ---------------------------------------------------------------------------
// Verify (counter, checklist §9 bullet 6)
// ---------------------------------------------------------------------------

export interface RedemptionView {
  redemptionId: string;
  status: RedemptionStatus;
  /** Status as it should be *shown*: a live code past its deadline reads expired. */
  displayStatus: RedemptionStatus;
  rewardId: string;
  rewardName: string;
  rewardDescription: string | null;
  cost: number;
  unit: LoyaltyType;
  unitName: string;
  customerName: string;
  balance: number;
  expiresAt: Date | null;
  createdAt: Date;
  verifiedAt: Date | null;
  redeemedAt: Date | null;
  /** Only a `VERIFIED` code may be completed. */
  redeemable: boolean;
  /** What this call just changed: a first verification, an expiry settlement, or nothing. */
  changed: "verified" | "expired" | null;
}

async function buildView(
  em: EntityManager,
  redemption: RewardRedemption,
  changed: RedemptionView["changed"],
): Promise<RedemptionView> {
  const reward = await em.findOne(RewardEntity, {
    where: { id: redemption.rewardId, merchantId: redemption.merchantId },
  });
  const membership = await em.findOneBy(LoyaltyMembershipEntity, {
    id: redemption.membershipId,
  });
  const profile = membership
    ? await em.findOneBy(CustomerProfileEntity, {
        id: membership.customerProfileId,
      })
    : null;
  const unitName = await resolveUnitLabel(
    em,
    redemption.merchantId,
    redemption.unit,
  );

  const due =
    LIVE_STATUSES.includes(redemption.status) &&
    redemption.expiresAt !== null &&
    redemption.expiresAt.getTime() <= Date.now();

  return {
    redemptionId: redemption.id,
    status: redemption.status,
    displayStatus: due ? "EXPIRED" : redemption.status,
    rewardId: redemption.rewardId,
    rewardName: reward?.name ?? "Reward",
    rewardDescription: reward?.description ?? null,
    cost: redemption.cost,
    unit: redemption.unit,
    unitName,
    customerName: profile?.name ?? "Member",
    balance: membership?.balance ?? 0,
    expiresAt: redemption.expiresAt,
    createdAt: redemption.createdAt,
    verifiedAt: redemption.verifiedAt,
    redeemedAt: redemption.redeemedAt,
    redeemable: redemption.status === "VERIFIED",
    changed,
  };
}

/**
 * Looks a code up by its hash inside the caller's tenant and records that a
 * human checked it.
 *
 * Deliberately *not* a throwing check for a code that exists: an expired,
 * cancelled or already-redeemed code comes back as a view saying so, because
 * the cashier needs to know what they are looking at. Only an unknown code
 * (or one belonging to another tenant) is a miss — and a miss looks exactly
 * the same either way.
 */
export async function verifyRedemption(
  em: EntityManager,
  auth: AuthContext,
  input: { code: unknown },
): Promise<RedemptionView> {
  const merchantId = requireCounterAccess(auth);
  const codeHash = hashRedemptionCode(parseRedemptionCode(input.code));

  const redemption = await em
    .createQueryBuilder()
    .select("r")
    .from(RewardRedemptionEntity, "r")
    .where("r.codeHash = :codeHash AND r.merchantId = :merchantId", {
      codeHash,
      merchantId,
    })
    .setLock("pessimistic_write")
    .getOne();
  if (!redemption) {
    throw new NotFoundError("No redemption matched that code.");
  }

  const expired = await expireIfDue(em, redemption, auth.userId);
  if (expired) return buildView(em, redemption, "expired");

  let changed: RedemptionView["changed"] = null;
  if (redemption.status === "ISSUED") {
    const now = new Date();
    const updated = await em.update(
      RewardRedemptionEntity,
      { id: redemption.id, status: "ISSUED" },
      {
        status: "VERIFIED",
        verifiedBy: auth.userId,
        verifiedAt: now,
        updatedAt: now,
      },
    );
    if (updated.affected) {
      redemption.status = "VERIFIED";
      redemption.verifiedBy = auth.userId;
      redemption.verifiedAt = now;
      redemption.updatedAt = now;
      changed = "verified";
    }
  }
  return buildView(em, redemption, changed);
}

// ---------------------------------------------------------------------------
// Complete (counter, checklist §9 bullets 7–8)
// ---------------------------------------------------------------------------

export type CompleteOutcome =
  | {
      kind: "completed";
      /** True when this redemption was already completed — nothing changed. */
      replayed: boolean;
      redemptionId: string;
      rewardId: string;
      rewardName: string;
      customerName: string;
      unitName: string;
      cost: number;
      balance: number;
    }
  | {
      kind: "expired";
      redemptionId: string;
      rewardId: string;
      rewardName: string;
    }
  | {
      kind: "needs_verification";
      redemptionId: string;
      rewardId: string;
      rewardName: string;
    }
  | {
      kind: "cancelled";
      redemptionId: string;
      rewardId: string;
      rewardName: string;
    };

/**
 * The single-use step: `VERIFIED → REDEEMED`, once.
 *
 * The value was reserved at issue, so this writes no ledger entry — the row
 * lock plus the conditional status update are what make a double submit
 * resolve to one completion and one replay instead of a double spend. The
 * outbox event is enqueued in the same transaction under a business key
 * derived from the redemption id, so it, too, goes out at most once.
 */
export async function completeRedemption(
  em: EntityManager,
  auth: AuthContext,
  input: { redemptionId: unknown },
): Promise<CompleteOutcome> {
  const merchantId = requireCounterAccess(auth);
  const redemptionId = parseId(
    input.redemptionId,
    "redemptionId",
    "That code could not be found.",
  );

  const redemption = await lockRedemption(em, merchantId, redemptionId);
  const reward = await em.findOne(RewardEntity, {
    where: { id: redemption.rewardId, merchantId },
  });
  const rewardName = reward?.name ?? "Reward";

  const expired = await expireIfDue(em, redemption, auth.userId);
  if (expired || redemption.status === "EXPIRED") {
    return {
      kind: "expired",
      redemptionId,
      rewardId: redemption.rewardId,
      rewardName,
    };
  }
  if (redemption.status === "CANCELLED") {
    return {
      kind: "cancelled",
      redemptionId,
      rewardId: redemption.rewardId,
      rewardName,
    };
  }
  if (redemption.status === "ISSUED") {
    return {
      kind: "needs_verification",
      redemptionId,
      rewardId: redemption.rewardId,
      rewardName,
    };
  }

  const membership = await em.findOneBy(LoyaltyMembershipEntity, {
    id: redemption.membershipId,
  });
  const profile = membership
    ? await em.findOneBy(CustomerProfileEntity, {
        id: membership.customerProfileId,
      })
    : null;
  const unitName = await resolveUnitLabel(
    em,
    redemption.merchantId,
    redemption.unit,
  );
  const view = {
    redemptionId,
    rewardId: redemption.rewardId,
    rewardName,
    customerName: profile?.name ?? "Member",
    unitName,
    cost: redemption.cost,
    balance: membership?.balance ?? 0,
  };

  if (redemption.status === "REDEEMED") {
    return { kind: "completed", replayed: true, ...view };
  }

  const now = new Date();
  const updated = await em.update(
    RewardRedemptionEntity,
    { id: redemption.id, status: "VERIFIED" },
    {
      status: "REDEEMED",
      redeemedBy: auth.userId,
      redeemedAt: now,
      updatedAt: now,
    },
  );
  if (!updated.affected) {
    // Someone completed it between the read and the write — same answer: it
    // is done, and this caller changes nothing.
    return { kind: "completed", replayed: true, ...view };
  }
  redemption.status = "REDEEMED";
  redemption.redeemedBy = auth.userId;
  redemption.redeemedAt = now;
  redemption.updatedAt = now;

  await enqueueDomainEvent(em, {
    merchantId,
    eventType: "reward.redeemed",
    aggregateType: "reward_redemption",
    aggregateId: redemption.id,
    idempotencyKey: `reward.redeemed:${redemption.id}`,
    payload: {
      rewardId: redemption.rewardId,
      membershipId: redemption.membershipId,
      unit: redemption.unit,
      cost: redemption.cost,
      verifiedBy: redemption.verifiedBy,
      redeemedBy: auth.userId,
    },
  });

  return { kind: "completed", replayed: false, ...view };
}
