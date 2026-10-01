import { In, type DataSource } from "typeorm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AuthContext } from "@/auth/context";
import { closeDb, getDb } from "@/db/connection";
import { CustomerProfileEntity } from "@/db/entities/customer-profile.entity";
import {
  DomainEventOutboxEntity,
  type DomainEventOutbox,
} from "@/db/entities/domain-event-outbox.entity";
import { LoyaltyMembershipEntity } from "@/db/entities/loyalty-membership.entity";
import { LoyaltyProgramEntity } from "@/db/entities/loyalty-program.entity";
import {
  LoyaltyTransactionEntity,
  type LoyaltyTransaction,
} from "@/db/entities/loyalty-transaction.entity";
import { MerchantEntity } from "@/db/entities/merchant.entity";
import { RewardEntity } from "@/db/entities/reward.entity";
import { RewardRedemptionEntity } from "@/db/entities/reward-redemption.entity";
import { UserEntity } from "@/db/entities/user.entity";
import { assertProjectionMatchesLedger, recordEarn } from "@/db/ledger";
import { runInTransaction } from "@/db/transactions";
import {
  hashRedemptionCode,
  normalizeRedemptionCode,
} from "@/features/redemptions/code";
import {
  completeRedemption,
  issueRedemption,
  verifyRedemption,
  type IssuedRedemption,
} from "@/features/redemptions/service";
import { setRewardActive, updateReward } from "@/features/rewards/service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

import { isPostgresReachable } from "../helpers/services";

/**
 * Redemption lifecycle suite (checklist §9, PRD §19/§20).
 *
 * The service under test is the only authority for minting, checking and
 * consuming a code, so the assertions are about the guarantees §9 demands:
 *
 *   - a code is opaque: only its SHA-256 hash is ever stored, and the value
 *     it represents is *reserved* in the ledger the moment it is issued;
 *   - verification and redemption are distinct — verifying records who
 *     checked the code and can never consume it;
 *   - completion is single-use and idempotent, even under a double submit;
 *   - an expired or replaced code returns its value exactly once, with a
 *     reason, and frees the reward's redemption counter;
 *   - every read and write carries the tenant predicate — another store's
 *     code, reward or redemption is "not found", and a customer session may
 *     never stand in as the verifier of record;
 *   - reward edits and toggles are tenant-scoped and never lower a limit
 *     below what has already been issued.
 *
 * Fixtures use fixed ids and are purged before/after the suite. Ledger rows
 * cannot be deleted while the append-only trigger is armed, so the purge uses
 * the documented maintenance procedure (session-local `replication_role`).
 */

const postgresReachable = await isPostgresReachable();

if (!postgresReachable) {
  console.warn(
    "[test] PostgreSQL is not reachable — skipping the redemption suite. Start local services with `pnpm services:up`.",
  );
}

const OWNER_ID = "test_rdm_owner";
const STAFF_ID = "test_rdm_staff";
const CUSTOMER_ID = "test_rdm_customer";

const MERCHANT_ID = "e2222222-0000-4000-8000-000000000001";
const OTHER_MERCHANT_ID = "e2222222-0000-4000-8000-000000000002";
const PROFILE_ID = "f2222222-0000-4000-8000-000000000001";
const PROGRAM_ID = "02222222-0000-4000-8000-000000000001";
const OTHER_PROGRAM_ID = "02222222-0000-4000-8000-000000000002";
const MEMBERSHIP_ID = "12222222-0000-4000-8000-000000000001";

const REWARD_ID = "22222222-0000-4000-8000-000000000001";
const CHEAP_REWARD_ID = "22222222-0000-4000-8000-000000000002";
const LIMITED_REWARD_ID = "22222222-0000-4000-8000-000000000003";
const OTHER_REWARD_ID = "22222222-0000-4000-8000-000000000004";

const FIXTURE_USER_IDS = [OWNER_ID, STAFF_ID, CUSTOMER_ID];
const FIXTURE_MERCHANT_IDS = [MERCHANT_ID, OTHER_MERCHANT_ID];

const POINTS_CONFIGURATION = {
  pointsPerEuro: 10,
  rounding: "FLOOR",
  minimumPurchase: 5,
  expiryMonths: 12,
  redemptionThresholds: [{ cost: 100, label: "$5 off" }],
};

const REWARD_FIXTURES = [
  {
    id: REWARD_ID,
    merchantId: MERCHANT_ID,
    name: "Free coffee",
    description: "Any regular coffee, on the house",
    cost: 100,
    unit: "POINTS" as const,
    status: "active" as const,
    redemptionLimit: null,
  },
  {
    id: CHEAP_REWARD_ID,
    merchantId: MERCHANT_ID,
    name: "Free pastry",
    description: "Any pastry from the counter",
    cost: 60,
    unit: "POINTS" as const,
    status: "active" as const,
    redemptionLimit: null,
  },
  {
    id: LIMITED_REWARD_ID,
    merchantId: MERCHANT_ID,
    name: "Limited tasting flight",
    description: "One per store, ever",
    cost: 10,
    unit: "POINTS" as const,
    status: "active" as const,
    redemptionLimit: 1,
  },
  {
    id: OTHER_REWARD_ID,
    merchantId: OTHER_MERCHANT_ID,
    name: "Other store reward",
    description: "Belongs to the other tenant",
    cost: 50,
    unit: "POINTS" as const,
    status: "active" as const,
    redemptionLimit: null,
  },
];

function auth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: CUSTOMER_ID,
    role: "CUSTOMER",
    displayName: "Test Member",
    merchantId: MERCHANT_ID,
    preview: false,
    ...overrides,
  };
}

/** The counter side of the flow: same tenant, a staff identity. */
function staff(overrides: Partial<AuthContext> = {}): AuthContext {
  return auth({
    userId: STAFF_ID,
    role: "MERCHANT_STAFF",
    displayName: "Counter Staff",
    ...overrides,
  });
}

/**
 * Wipes this suite's rows between tests so every case starts from a clean
 * ledger. Ledger rows are append-only at the database level, so the delete
 * runs with row triggers lifted *for this session only* — the same
 * maintenance procedure the other integration suites use.
 */
async function resetFixtures(db: DataSource): Promise<void> {
  await db.transaction(async (em) => {
    await em.query(
      `SELECT set_config('session_replication_role', 'replica', true)`,
    );
    for (const table of [
      "domain_event_outbox",
      "loyalty_transaction",
      "reward_redemption",
    ]) {
      await em.query(`DELETE FROM ${table} WHERE merchant_id = $1`, [
        MERCHANT_ID,
      ]);
    }
  });

  for (const reward of REWARD_FIXTURES) {
    await db.manager.update(
      RewardEntity,
      { id: reward.id },
      {
        name: reward.name,
        description: reward.description,
        cost: reward.cost,
        status: "active",
        redemptionLimit: reward.redemptionLimit,
        redemptionCount: 0,
        expiresAt: null,
      },
    );
  }
  await db.manager.update(
    LoyaltyMembershipEntity,
    { id: MEMBERSHIP_ID },
    { balance: 0, status: "active" },
  );
}

/** The full purge, for suite setup and teardown (includes users/merchants). */
async function purgeFixtures(db: DataSource): Promise<void> {
  await db.transaction(async (em) => {
    await em.query(
      `SELECT set_config('session_replication_role', 'replica', true)`,
    );
    for (const merchantId of FIXTURE_MERCHANT_IDS) {
      await em.query(`DELETE FROM domain_event_outbox WHERE merchant_id = $1`, [
        merchantId,
      ]);
      for (const table of [
        "loyalty_transaction",
        "reward_redemption",
        "loyalty_membership",
        "loyalty_program",
        "reward",
        "campaign",
        "integration_record",
        "merchant_membership",
        "subscription",
        "audit_log",
      ]) {
        await em.query(`DELETE FROM ${table} WHERE merchant_id = $1`, [
          merchantId,
        ]);
      }
      await em.query(`DELETE FROM merchant WHERE id = $1`, [merchantId]);
    }
    await em.query(
      `DELETE FROM customer_profile WHERE user_id = ANY($1::text[])`,
      [FIXTURE_USER_IDS],
    );
    await em.query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [
      FIXTURE_USER_IDS,
    ]);
  });
}

async function createFixtures(db: DataSource): Promise<void> {
  for (const user of [
    { id: OWNER_ID, name: "Redemption Test Owner", role: "MERCHANT" as const },
    { id: STAFF_ID, name: "Counter Staff", role: "MERCHANT" as const },
    { id: CUSTOMER_ID, name: "Test Member", role: "CUSTOMER" as const },
  ]) {
    await db.manager.insert(UserEntity, {
      id: user.id,
      name: user.name,
      email: `${user.id}@rdm.test`,
      emailVerified: true,
      image: null,
      role: user.role,
      status: "active",
    });
  }

  for (const [id, name, slug] of [
    [MERCHANT_ID, "Redemption Test Café", "redemption-test-cafe"],
    [OTHER_MERCHANT_ID, "Redemption Test Roasters", "redemption-test-roasters"],
  ] as const) {
    await db.manager.insert(MerchantEntity, {
      id,
      name,
      slug,
      currency: "EUR",
      timezone: "UTC",
      status: "active",
    });
  }

  await db.manager.insert(CustomerProfileEntity, {
    id: PROFILE_ID,
    userId: CUSTOMER_ID,
    name: "Test Member",
  });

  for (const [id, merchantId, name] of [
    [PROGRAM_ID, MERCHANT_ID, "Redemption Points Program"],
    [OTHER_PROGRAM_ID, OTHER_MERCHANT_ID, "Other Points Program"],
  ] as const) {
    await db.manager.insert(LoyaltyProgramEntity, {
      id,
      merchantId,
      type: "POINTS",
      name,
      ruleVersion: 1,
      status: "active",
      configuration: POINTS_CONFIGURATION,
    });
  }

  await db.manager.insert(LoyaltyMembershipEntity, {
    id: MEMBERSHIP_ID,
    merchantId: MERCHANT_ID,
    customerProfileId: PROFILE_ID,
    balance: 0,
    status: "active",
  });

  for (const reward of REWARD_FIXTURES) {
    await db.manager.insert(RewardEntity, {
      ...reward,
      terms: null,
      imageUrl: null,
      redemptionCount: 0,
      expiresAt: null,
    });
  }
}

let seedSerial = 0;

/** Puts a known balance behind the member before a test that needs one. */
async function seedBalance(db: DataSource, amount: number): Promise<void> {
  await runInTransaction((em) =>
    recordEarn(em, {
      merchantId: MERCHANT_ID,
      membershipId: MEMBERSHIP_ID,
      unit: "POINTS",
      delta: amount,
      createdBy: STAFF_ID,
      idempotencyKey: `test-rdm-seed-${(seedSerial += 1)}`,
      metadata: { source: "test_seed" },
    }),
  );
}

async function balanceOf(db: DataSource): Promise<number> {
  const membership = await db.manager.findOneBy(LoyaltyMembershipEntity, {
    id: MEMBERSHIP_ID,
  });
  return membership?.balance ?? -1;
}

async function redemptionCount(
  db: DataSource,
  rewardId: string,
): Promise<number> {
  const reward = await db.manager.findOneBy(RewardEntity, { id: rewardId });
  return reward?.redemptionCount ?? -1;
}

async function ledgerRowsFor(
  db: DataSource,
  redemptionId: string,
): Promise<LoyaltyTransaction[]> {
  return db.manager.find(LoyaltyTransactionEntity, {
    where: { redemptionId },
    order: { createdAt: "ASC" },
  });
}

async function redeemsOutboxRows(db: DataSource): Promise<DomainEventOutbox[]> {
  return db.manager.find(DomainEventOutboxEntity, {
    where: { merchantId: MERCHANT_ID, eventType: "reward.redeemed" },
  });
}

describe.skipIf(!postgresReachable)("Redemption service (checklist §9)", () => {
  let db: DataSource;

  beforeAll(async () => {
    db = await getDb();
    await purgeFixtures(db);
    await createFixtures(db);
  });

  beforeEach(async () => {
    await resetFixtures(db);
  });

  afterAll(async () => {
    if (db) await purgeFixtures(db);
    await closeDb();
  });

  // -------------------------------------------------------------------------
  // Issue (§9 bullets 4–5, PRD §19)
  // -------------------------------------------------------------------------

  it("reserves the value when it mints a code, storing only the hash", async () => {
    await seedBalance(db, 300);

    const issued = await runInTransaction((em) =>
      issueRedemption(em, auth(), { rewardId: REWARD_ID }),
    );

    expect(issued.cost).toBe(100);
    expect(issued.unitName).toBe("points");
    expect(issued.formattedCode).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
    expect(issued.replacedPreviousCode).toBe(false);
    // A code is short-lived: within the configured TTL, never beyond it.
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(issued.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 120 * 60_000 + 5_000,
    );

    // The reservation is a real ledger entry, not a held-in-memory number.
    expect(await balanceOf(db)).toBe(200);
    const rows = await ledgerRowsFor(db, issued.redemptionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe("REWARD_REDEEMED");
    expect(rows[0]?.delta).toBe(-100);
    expect(rows[0]?.rewardId).toBe(REWARD_ID);
    expect(rows[0]?.createdBy).toBe(CUSTOMER_ID);

    const row = await db.manager.findOneBy(RewardRedemptionEntity, {
      id: issued.redemptionId,
    });
    expect(row?.status).toBe("ISSUED");
    expect(row?.requestedBy).toBe(CUSTOMER_ID);
    expect(row?.membershipId).toBe(MEMBERSHIP_ID);
    // Hash-only storage: the clear-text code never reaches the database.
    expect(row?.codeHash).toBe(
      hashRedemptionCode(normalizeRedemptionCode(issued.formattedCode)),
    );
    expect(JSON.stringify(row)).not.toContain(issued.code);
    expect(JSON.stringify(row)).not.toContain(issued.formattedCode);

    // The counter projection holds the slot the code is using.
    expect(await redemptionCount(db, REWARD_ID)).toBe(1);
    await assertProjectionMatchesLedger(db.manager, MEMBERSHIP_ID);
  });

  it("refuses to mint a code the balance cannot cover", async () => {
    await seedBalance(db, 50);

    await expect(
      runInTransaction((em) =>
        issueRedemption(em, auth(), { rewardId: REWARD_ID }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await balanceOf(db)).toBe(50);
    expect(await redemptionCount(db, REWARD_ID)).toBe(0);
    expect(
      await db.manager.count(RewardRedemptionEntity, {
        where: { merchantId: MERCHANT_ID },
      }),
    ).toBe(0);
  });

  it("refuses paused rewards and rewards past their own expiry", async () => {
    await seedBalance(db, 300);

    await runInTransaction((em) =>
      setRewardActive(em, {
        merchantId: MERCHANT_ID,
        rewardId: REWARD_ID,
        active: false,
      }),
    );
    await expect(
      runInTransaction((em) =>
        issueRedemption(em, auth(), { rewardId: REWARD_ID }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    await runInTransaction((em) =>
      setRewardActive(em, {
        merchantId: MERCHANT_ID,
        rewardId: REWARD_ID,
        active: true,
      }),
    );
    await db.manager.update(
      RewardEntity,
      { id: REWARD_ID },
      { expiresAt: new Date(Date.now() - 60_000) },
    );
    await expect(
      runInTransaction((em) =>
        issueRedemption(em, auth(), { rewardId: REWARD_ID }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    // Neither attempt touched the member's money.
    expect(await balanceOf(db)).toBe(300);
    expect(await redemptionCount(db, REWARD_ID)).toBe(0);
  });

  it("never issues against another tenant's reward", async () => {
    await seedBalance(db, 300);

    await expect(
      runInTransaction((em) =>
        issueRedemption(em, auth(), { rewardId: OTHER_REWARD_ID }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await redemptionCount(db, OTHER_REWARD_ID)).toBe(0);
    expect(await balanceOf(db)).toBe(300);
  });

  it("never mints a code from the counter — only the member can", async () => {
    await seedBalance(db, 300);

    await expect(
      runInTransaction((em) =>
        issueRedemption(em, staff(), { rewardId: REWARD_ID }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(await balanceOf(db)).toBe(300);
    expect(
      await db.manager.count(RewardRedemptionEntity, {
        where: { merchantId: MERCHANT_ID },
      }),
    ).toBe(0);
  });

  it("enforces the reward's redemption limit across the whole store", async () => {
    await seedBalance(db, 300);

    const first = await runInTransaction((em) =>
      issueRedemption(em, auth(), { rewardId: LIMITED_REWARD_ID }),
    );
    await runInTransaction((em) =>
      verifyRedemption(em, staff(), { code: first.formattedCode }),
    );
    await runInTransaction((em) =>
      completeRedemption(em, staff(), { redemptionId: first.redemptionId }),
    );

    await expect(
      runInTransaction((em) =>
        issueRedemption(em, auth(), { rewardId: LIMITED_REWARD_ID }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await redemptionCount(db, LIMITED_REWARD_ID)).toBe(1);
    expect(await balanceOf(db)).toBe(290);
  });

  // -------------------------------------------------------------------------
  // Verify (§9 bullet 6, PRD §20)
  // -------------------------------------------------------------------------

  it("verifies a code by recording who checked it, without spending a thing", async () => {
    await seedBalance(db, 300);
    const issued = await runInTransaction((em) =>
      issueRedemption(em, auth(), { rewardId: REWARD_ID }),
    );

    const view = await runInTransaction((em) =>
      verifyRedemption(em, staff(), { code: issued.formattedCode }),
    );

    expect(view.status).toBe("VERIFIED");
    expect(view.displayStatus).toBe("VERIFIED");
    expect(view.redeemable).toBe(true);
    expect(view.changed).toBe("verified");
    expect(view.customerName).toBe("Test Member");
    expect(view.balance).toBe(200);
    expect(view.cost).toBe(100);
    expect(view.rewardName).toBe("Free coffee");

    const row = await db.manager.findOneBy(RewardRedemptionEntity, {
      id: issued.redemptionId,
    });
    expect(row?.status).toBe("VERIFIED");
    expect(row?.verifiedBy).toBe(STAFF_ID);
    expect(row?.verifiedAt).toBeInstanceOf(Date);

    // Verify never touches value: one reservation, one ledger row.
    expect(await balanceOf(db)).toBe(200);
    expect(await ledgerRowsFor(db, issued.redemptionId)).toHaveLength(1);
    await assertProjectionMatchesLedger(db.manager, MEMBERSHIP_ID);
  });

  it("is repeatable: a second check changes nothing and records nothing new", async () => {
    await seedBalance(db, 300);
    const issued = await runInTransaction((em) =>
      issueRedemption(em, auth(), { rewardId: REWARD_ID }),
    );
    const first = await runInTransaction((em) =>
      verifyRedemption(em, staff(), { code: issued.formattedCode }),
    );
    const again = await runInTransaction((em) =>
      verifyRedemption(em, staff(), { code: issued.formattedCode }),
    );

    expect(again.changed).toBeNull();
    expect(again.verifiedAt?.getTime()).toBe(first.verifiedAt?.getTime());
    expect(again.redeemable).toBe(true);
    expect(await balanceOf(db)).toBe(200);
    expect(await ledgerRowsFor(db, issued.redemptionId)).toHaveLength(1);
  });

  it("treats an unknown code as a miss and a malformed one as a hint", async () => {
    await expect(
      runInTransaction((em) =>
        verifyRedemption(em, staff(), { code: "AAAAA-BBBBB" }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      runInTransaction((em) =>
        verifyRedemption(em, staff(), { code: "not-a-code!" }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    // A miss never leaks whether *some* code exists elsewhere.
    await expect(
      runInTransaction((em) =>
        verifyRedemption(em, staff(), { code: "00000-00000" }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps codes invisible to other tenants and to the customer themselves", async () => {
    await seedBalance(db, 300);
    const issued = await runInTransaction((em) =>
      issueRedemption(em, auth(), { rewardId: REWARD_ID }),
    );

    // Another store's counter: same code, no such redemption.
    await expect(
      runInTransaction((em) =>
        verifyRedemption(em, staff({ merchantId: OTHER_MERCHANT_ID }), {
          code: issued.formattedCode,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Nor may the issuing customer verify their own code: the verifier is a
    // different person (§9 bullet 8 records who that was).
    await expect(
      runInTransaction((em) =>
        verifyRedemption(em, auth(), { code: issued.formattedCode }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const row = await db.manager.findOneBy(RewardRedemptionEntity, {
      id: issued.redemptionId,
    });
    expect(row?.status).toBe("ISSUED");
    expect(row?.verifiedBy).toBeNull();
    expect(await balanceOf(db)).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Complete (§9 bullets 7–8, PRD §20)
  // -------------------------------------------------------------------------

  it("completes once, idempotently, and emits exactly one event", async () => {
    await seedBalance(db, 300);
    const issued = await runInTransaction((em) =>
      issueRedemption(em, auth(), { rewardId: REWARD_ID }),
    );
    await runInTransaction((em) =>
      verifyRedemption(em, staff(), { code: issued.formattedCode }),
    );

    const first = await runInTransaction((em) =>
      completeRedemption(em, staff(), {
        redemptionId: issued.redemptionId,
      }),
    );
    expect(first).toMatchObject({ kind: "completed", replayed: false });

    const row = await db.manager.findOneBy(RewardRedemptionEntity, {
      id: issued.redemptionId,
    });
    expect(row?.status).toBe("REDEEMED");
    expect(row?.redeemedBy).toBe(STAFF_ID);
    expect(row?.redeemedAt).toBeInstanceOf(Date);

    // The value was reserved at issue: completion writes no new entry.
    expect(await balanceOf(db)).toBe(200);
    expect(await ledgerRowsFor(db, issued.redemptionId)).toHaveLength(1);
    expect(await redemptionCount(db, REWARD_ID)).toBe(1);

    const replay = await runInTransaction((em) =>
      completeRedemption(em, staff(), {
        redemptionId: issued.redemptionId,
      }),
    );
    expect(replay).toMatchObject({ kind: "completed", replayed: true });
    expect(await balanceOf(db)).toBe(200);
    expect(await ledgerRowsFor(db, issued.redemptionId)).toHaveLength(1);

    const events = await redeemsOutboxRows(db);
    expect(events).toHaveLength(1);
    expect(events[0]?.aggregateId).toBe(issued.redemptionId);
    expect(events[0]?.idempotencyKey).toBe(
      `reward.redeemed:${issued.redemptionId}`,
    );
    expect(events[0]?.payload).toMatchObject({
      rewardId: REWARD_ID,
      membershipId: MEMBERSHIP_ID,
      cost: 100,
    });
    // The payload carries ids and numbers — never a code.
    expect(JSON.stringify(events[0]?.payload ?? {})).not.toContain(issued.code);
    await assertProjectionMatchesLedger(db.manager, MEMBERSHIP_ID);
  });

  it("refuses to complete a code that was never verified", async () => {
    await seedBalance(db, 300);
    const issued = await runInTransaction((em) =>
      issueRedemption(em, auth(), { rewardId: REWARD_ID }),
    );

    const outcome = await runInTransaction((em) =>
      completeRedemption(em, staff(), {
        redemptionId: issued.redemptionId,
      }),
    );
    expect(outcome.kind).toBe("needs_verification");

    const row = await db.manager.findOneBy(RewardRedemptionEntity, {
      id: issued.redemptionId,
    });
    expect(row?.status).toBe("ISSUED");
    expect(row?.redeemedBy).toBeNull();
    expect(await balanceOf(db)).toBe(200);
    expect(await redeemsOutboxRows(db)).toHaveLength(0);
  });

  it("returns an expired code's value once, with a reason, and closes it", async () => {
    await seedBalance(db, 300);
    const issued = await runInTransaction((em) =>
      issueRedemption(em, auth(), { rewardId: REWARD_ID }),
    );

    // The deadline passes while the code sits in the customer's wallet.
    await db.manager.update(
      RewardRedemptionEntity,
      { id: issued.redemptionId },
      { expiresAt: new Date(Date.now() - 1_000) },
    );

    const view = await runInTransaction((em) =>
      verifyRedemption(em, staff(), { code: issued.formattedCode }),
    );
    expect(view.status).toBe("EXPIRED");
    expect(view.displayStatus).toBe("EXPIRED");
    expect(view.redeemable).toBe(false);
    expect(view.changed).toBe("expired");

    // The reservation went back to the member — once, as an audited entry.
    expect(await balanceOf(db)).toBe(300);
    const rows = await ledgerRowsFor(db, issued.redemptionId);
    expect(rows).toHaveLength(2);
    expect(rows[1]?.type).toBe("POINTS_ADJUSTED");
    expect(rows[1]?.delta).toBe(100);
    expect(rows[1]?.reason).toBe("Redemption code expired");
    expect(await redemptionCount(db, REWARD_ID)).toBe(0);

    // And it cannot be resurrected: completion reports the state it found.
    const outcome = await runInTransaction((em) =>
      completeRedemption(em, staff(), {
        redemptionId: issued.redemptionId,
      }),
    );
    expect(outcome.kind).toBe("expired");
    expect(await balanceOf(db)).toBe(300);
    await assertProjectionMatchesLedger(db.manager, MEMBERSHIP_ID);
  });

  it("settles a replaced code instead of leaving two live ones", async () => {
    await seedBalance(db, 300);

    const first = await runInTransaction((em) =>
      issueRedemption(em, auth(), { rewardId: REWARD_ID }),
    );
    const second = await runInTransaction((em) =>
      issueRedemption(em, auth(), { rewardId: REWARD_ID }),
    );

    expect(second.replacedPreviousCode).toBe(true);
    expect(first.replacedPreviousCode).toBe(false);
    expect(second.formattedCode).not.toBe(first.formattedCode);

    // One reservation, not two: the old code refunded its hold.
    expect(await balanceOf(db)).toBe(200);
    expect(await redemptionCount(db, REWARD_ID)).toBe(1);
    expect(
      await db.manager.count(RewardRedemptionEntity, {
        where: {
          merchantId: MERCHANT_ID,
          rewardId: REWARD_ID,
          status: In(["ISSUED", "VERIFIED"]),
        },
      }),
    ).toBe(1);

    const firstRow = await db.manager.findOneBy(RewardRedemptionEntity, {
      id: first.redemptionId,
    });
    expect(firstRow?.status).toBe("CANCELLED");
    expect(await ledgerRowsFor(db, first.redemptionId)).toHaveLength(2);

    // The superseded code is dead at the counter, and says so as a view.
    const view = await runInTransaction((em) =>
      verifyRedemption(em, staff(), { code: first.formattedCode }),
    );
    expect(view.status).toBe("CANCELLED");
    expect(view.redeemable).toBe(false);
    expect(view.changed).toBeNull();
    expect(await balanceOf(db)).toBe(200);
    await assertProjectionMatchesLedger(db.manager, MEMBERSHIP_ID);
  });

  it("keeps another store's redemption out of this store's counter", async () => {
    await seedBalance(db, 300);
    const issued = await runInTransaction((em) =>
      issueRedemption(em, auth(), { rewardId: REWARD_ID }),
    );
    await runInTransaction((em) =>
      verifyRedemption(em, staff(), { code: issued.formattedCode }),
    );

    await expect(
      runInTransaction((em) =>
        completeRedemption(em, staff({ merchantId: OTHER_MERCHANT_ID }), {
          redemptionId: issued.redemptionId,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    const row = await db.manager.findOneBy(RewardRedemptionEntity, {
      id: issued.redemptionId,
    });
    expect(row?.status).toBe("VERIFIED");
    expect(await balanceOf(db)).toBe(200);
    expect(await redeemsOutboxRows(db)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Concurrency (§9 bullet 9)
  // -------------------------------------------------------------------------

  it("cannot be overdrawn by two codes issued at once", async () => {
    await seedBalance(db, 100);

    const results = await Promise.allSettled([
      runInTransaction((em) =>
        issueRedemption(em, auth(), { rewardId: REWARD_ID }),
      ),
      runInTransaction((em) =>
        issueRedemption(em, auth(), { rewardId: CHEAP_REWARD_ID }),
      ),
    ]);

    const winners = results.filter(
      (result): result is PromiseFulfilledResult<IssuedRedemption> =>
        result.status === "fulfilled",
    );
    const losers = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    // Exactly one of the two claims the balance; the other cannot go first
    // *and* second — the membership lock decides, and the CHECK refuses it.
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]?.reason).toBeInstanceOf(ConflictError);

    const winner = winners[0]!.value;
    expect(await balanceOf(db)).toBe(100 - winner.cost);
    expect(
      await db.manager.count(RewardRedemptionEntity, {
        where: { merchantId: MERCHANT_ID, status: In(["ISSUED", "VERIFIED"]) },
      }),
    ).toBe(1);
    await assertProjectionMatchesLedger(db.manager, MEMBERSHIP_ID);
  });

  it("resolves two concurrent completions to one spend", async () => {
    await seedBalance(db, 300);
    const issued = await runInTransaction((em) =>
      issueRedemption(em, auth(), { rewardId: REWARD_ID }),
    );
    await runInTransaction((em) =>
      verifyRedemption(em, staff(), { code: issued.formattedCode }),
    );

    const [first, second] = await Promise.all([
      runInTransaction((em) =>
        completeRedemption(em, staff(), {
          redemptionId: issued.redemptionId,
        }),
      ),
      runInTransaction((em) =>
        completeRedemption(em, staff(), {
          redemptionId: issued.redemptionId,
        }),
      ),
    ]);

    expect(first).toMatchObject({ kind: "completed" });
    expect(second).toMatchObject({ kind: "completed" });
    expect(
      [first, second].filter(
        (outcome) => outcome.kind === "completed" && outcome.replayed === false,
      ),
    ).toHaveLength(1);

    expect(await balanceOf(db)).toBe(200);
    expect(await ledgerRowsFor(db, issued.redemptionId)).toHaveLength(1);
    expect(await redeemsOutboxRows(db)).toHaveLength(1);
    await assertProjectionMatchesLedger(db.manager, MEMBERSHIP_ID);
  });

  // -------------------------------------------------------------------------
  // Reward CRUD (§9 bullets 1–3)
  // -------------------------------------------------------------------------

  it("edits a reward in place, tenant-scoped, without touching its unit", async () => {
    const values = {
      name: "Free filter refill",
      description: "Fresh filter, no charge",
      cost: 150,
      terms: "One per visit",
      expiresAt: "",
      redemptionLimit: 10,
    };

    const updated = await runInTransaction((em) =>
      updateReward(em, {
        merchantId: MERCHANT_ID,
        rewardId: REWARD_ID,
        values,
      }),
    );
    expect(updated.name).toBe("Free filter refill");
    expect(updated.cost).toBe(150);
    expect(updated.terms).toBe("One per visit");
    expect(updated.redemptionLimit).toBe(10);
    // The dimension a reward is priced in never changes under an edit.
    expect(updated.unit).toBe("POINTS");

    // Another tenant gets a 404 rather than someone else's reward.
    await expect(
      runInTransaction((em) =>
        updateReward(em, {
          merchantId: OTHER_MERCHANT_ID,
          rewardId: REWARD_ID,
          values,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      runInTransaction((em) =>
        setRewardActive(em, {
          merchantId: OTHER_MERCHANT_ID,
          rewardId: REWARD_ID,
          active: false,
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    // …and the foreign attempt left the reward exactly as the edit left it.
    const row = await db.manager.findOneBy(RewardEntity, { id: REWARD_ID });
    expect(row?.name).toBe("Free filter refill");
    expect(row?.status).toBe("active");
  });

  it("pauses and resumes a reward idempotently", async () => {
    const paused = await runInTransaction((em) =>
      setRewardActive(em, {
        merchantId: MERCHANT_ID,
        rewardId: REWARD_ID,
        active: false,
      }),
    );
    expect(paused.status).toBe("inactive");

    // Toggling to the same state is a no-op, not an error.
    await runInTransaction((em) =>
      setRewardActive(em, {
        merchantId: MERCHANT_ID,
        rewardId: REWARD_ID,
        active: false,
      }),
    );

    const resumed = await runInTransaction((em) =>
      setRewardActive(em, {
        merchantId: MERCHANT_ID,
        rewardId: REWARD_ID,
        active: true,
      }),
    );
    expect(resumed.status).toBe("active");
  });

  it("refuses a redemption limit below what was already issued", async () => {
    await db.manager.update(
      RewardEntity,
      { id: REWARD_ID },
      { redemptionCount: 5 },
    );

    await expect(
      runInTransaction((em) =>
        updateReward(em, {
          merchantId: MERCHANT_ID,
          rewardId: REWARD_ID,
          values: {
            name: "Free coffee",
            description: "Any regular coffee, on the house",
            cost: 100,
            terms: "",
            expiresAt: "",
            redemptionLimit: 3,
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    // Nothing was written — the check runs before any assignment.
    const row = await db.manager.findOneBy(RewardEntity, { id: REWARD_ID });
    expect(row?.redemptionLimit).toBeNull();
    expect(row?.redemptionCount).toBe(5);
    expect(row?.cost).toBe(100);
  });
});
