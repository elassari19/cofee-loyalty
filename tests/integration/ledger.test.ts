import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/connection";
import { CustomerProfileEntity } from "@/db/entities/customer-profile.entity";
import type { LoyaltyTransaction } from "@/db/entities/loyalty-transaction.entity";
import { LoyaltyMembershipEntity } from "@/db/entities/loyalty-membership.entity";
import { LoyaltyProgramEntity } from "@/db/entities/loyalty-program.entity";
import { MerchantEntity } from "@/db/entities/merchant.entity";
import { UserEntity } from "@/db/entities/user.entity";
import {
  appendLedgerEntry,
  assertProjectionMatchesLedger,
  computeBalanceFromLedger,
  readBalanceReport,
  recordAdjustment,
  recordEarn,
  recordRedemption,
} from "@/db/ledger";
import { runInTransaction } from "@/db/transactions";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import { isPostgresReachable } from "../helpers/services";

/**
 * Ledger consistency suite (checklist §4 — "balance projection, with
 * reconciliation tests proving it matches the ledger" and the section's
 * Done-when: migrations in place, tenant-owned rows require a tenant, ledger
 * history stays auditable).
 *
 * Fixtures use fixed ids and are purged before/after the suite. Purging a
 * fixture ledger row requires temporarily disabling the append-only trigger —
 * the same documented maintenance procedure described in docs/database.md.
 * Test order within this file matters (vitest runs `it`s sequentially);
 * later tests read the state earlier ones produced.
 */

const postgresReachable = await isPostgresReachable();

if (!postgresReachable) {
  console.warn(
    "[test] PostgreSQL is not reachable — skipping the ledger suite. Start local services with `pnpm services:up`.",
  );
}

const OWNER_ID = "seed_test_ledger_owner";
const CUSTOMER_A_ID = "seed_test_ledger_customer_a";
const CUSTOMER_B_ID = "seed_test_ledger_customer_b";
const MERCHANT_A_ID = "a1111111-0000-4000-8000-000000000001";
const MERCHANT_B_ID = "a1111111-0000-4000-8000-000000000002";
const PROFILE_A_ID = "b1111111-0000-4000-8000-000000000001";
const PROFILE_B_ID = "b1111111-0000-4000-8000-000000000002";
const PROGRAM_A_ID = "c1111111-0000-4000-8000-000000000001";
const PROGRAM_B_ID = "c1111111-0000-4000-8000-000000000002";
const MEMBERSHIP_A_ID = "d1111111-0000-4000-8000-000000000001";
const MEMBERSHIP_B_ID = "d1111111-0000-4000-8000-000000000002";

const FIXTURE_USER_IDS = [OWNER_ID, CUSTOMER_A_ID, CUSTOMER_B_ID];
const FIXTURE_MERCHANT_IDS = [MERCHANT_A_ID, MERCHANT_B_ID];

const APPEND_ONLY_TRIGGERS = [
  {
    table: "loyalty_transaction",
    trigger: "trg_loyalty_transaction_append_only",
  },
  { table: "audit_log", trigger: "trg_audit_log_append_only" },
] as const;

async function withAppendOnlyDisabled(
  db: DataSource,
  run: () => Promise<void>,
): Promise<void> {
  for (const { table, trigger } of APPEND_ONLY_TRIGGERS) {
    await db.query(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);
  }
  try {
    await run();
  } finally {
    for (const { table, trigger } of APPEND_ONLY_TRIGGERS) {
      await db.query(`ALTER TABLE "${table}" ENABLE TRIGGER "${trigger}"`);
    }
  }
}

async function purgeFixtures(db: DataSource): Promise<void> {
  await withAppendOnlyDisabled(db, async () => {
    for (const merchantId of FIXTURE_MERCHANT_IDS) {
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
        await db.query(`DELETE FROM ${table} WHERE merchant_id = $1`, [
          merchantId,
        ]);
      }
      await db.query(`DELETE FROM merchant WHERE id = $1`, [merchantId]);
    }
    for (const userId of FIXTURE_USER_IDS) {
      await db.query(`DELETE FROM customer_profile WHERE user_id = $1`, [
        userId,
      ]);
      await db.query(`DELETE FROM "user" WHERE id = $1`, [userId]);
    }
  });
}

async function createFixtures(db: DataSource): Promise<void> {
  await db.manager.insert(UserEntity, {
    id: OWNER_ID,
    name: "Ledger Test Owner",
    email: "ledger-owner@test.local",
    emailVerified: true,
    image: null,
    role: "MERCHANT",
    status: "active",
  });
  await db.manager.insert(UserEntity, {
    id: CUSTOMER_A_ID,
    name: "Ledger Customer A",
    email: "ledger-customer-a@test.local",
    emailVerified: true,
    image: null,
    role: "CUSTOMER",
    status: "active",
  });
  await db.manager.insert(UserEntity, {
    id: CUSTOMER_B_ID,
    name: "Ledger Customer B",
    email: "ledger-customer-b@test.local",
    emailVerified: true,
    image: null,
    role: "CUSTOMER",
    status: "active",
  });

  await db.manager.insert(MerchantEntity, {
    id: MERCHANT_A_ID,
    name: "Ledger Test Café",
    slug: "ledger-test-cafe",
    currency: "EUR",
    timezone: "UTC",
    status: "active",
  });
  await db.manager.insert(MerchantEntity, {
    id: MERCHANT_B_ID,
    name: "Ledger Test Roasters",
    slug: "ledger-test-roasters",
    currency: "EUR",
    timezone: "UTC",
    status: "active",
  });

  await db.manager.insert(CustomerProfileEntity, {
    id: PROFILE_A_ID,
    userId: CUSTOMER_A_ID,
    name: "Ledger Customer A",
  });
  await db.manager.insert(CustomerProfileEntity, {
    id: PROFILE_B_ID,
    userId: CUSTOMER_B_ID,
    name: "Ledger Customer B",
  });

  await db.manager.insert(LoyaltyProgramEntity, {
    id: PROGRAM_A_ID,
    merchantId: MERCHANT_A_ID,
    type: "POINTS",
    name: "Test Points Program",
    ruleVersion: 1,
    status: "active",
  });
  await db.manager.insert(LoyaltyProgramEntity, {
    id: PROGRAM_B_ID,
    merchantId: MERCHANT_B_ID,
    type: "STAMPS",
    name: "Test Stamp Program",
    ruleVersion: 1,
    status: "active",
  });

  await db.manager.insert(LoyaltyMembershipEntity, {
    id: MEMBERSHIP_A_ID,
    merchantId: MERCHANT_A_ID,
    customerProfileId: PROFILE_A_ID,
  });
  await db.manager.insert(LoyaltyMembershipEntity, {
    id: MEMBERSHIP_B_ID,
    merchantId: MERCHANT_B_ID,
    customerProfileId: PROFILE_B_ID,
  });
}

async function countLedgerRows(
  db: DataSource,
  membershipId: string,
): Promise<number> {
  const rows = await db.query<Array<{ count: number }>>(
    `SELECT count(*)::int AS count FROM loyalty_transaction WHERE membership_id = $1`,
    [membershipId],
  );
  return rows[0]?.count ?? 0;
}

async function countRowsWithKey(
  db: DataSource,
  idempotencyKey: string,
): Promise<number> {
  const rows = await db.query<Array<{ count: number }>>(
    `SELECT count(*)::int AS count FROM loyalty_transaction WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
  return rows[0]?.count ?? 0;
}

describe.skipIf(!postgresReachable)("Loyalty ledger (checklist §4)", () => {
  let db: DataSource;

  beforeAll(async () => {
    db = await getDb();
    await purgeFixtures(db);
    await createFixtures(db);
  }, 20_000);

  afterAll(async () => {
    if (db) await purgeFixtures(db);
    await closeDb();
  }, 20_000);

  it("starts from a reconciled zero balance", async () => {
    const report = await readBalanceReport(db.manager, MEMBERSHIP_A_ID);
    expect(report).toEqual({
      membershipId: MEMBERSHIP_A_ID,
      projected: 0,
      ledger: 0,
      inSync: true,
    });
  });

  it("appends an earn entry and advances the projection atomically", async () => {
    const entry = await runInTransaction((em) =>
      recordEarn(em, {
        merchantId: MERCHANT_A_ID,
        membershipId: MEMBERSHIP_A_ID,
        unit: "POINTS",
        delta: 100,
        purchaseAmount: 25,
        currency: "EUR",
        programId: PROGRAM_A_ID,
        ruleVersion: 1,
        createdBy: OWNER_ID,
        idempotencyKey: "test-earn-1",
      }),
    );

    expect(entry.type).toBe("POINTS_EARNED");
    expect(entry.delta).toBe(100);
    expect(entry.unit).toBe("POINTS");
    expect(entry.customerProfileId).toBe(PROFILE_A_ID);
    // `numeric` columns come back from pg as strings.
    expect(Number(entry.purchaseAmount)).toBe(25);

    const report = await readBalanceReport(db.manager, MEMBERSHIP_A_ID);
    expect(report).toMatchObject({ projected: 100, ledger: 100, inSync: true });
  }, 15_000);

  it("applies a retried submission exactly once", async () => {
    const earnInput = {
      merchantId: MERCHANT_A_ID,
      membershipId: MEMBERSHIP_A_ID,
      unit: "POINTS" as const,
      delta: 10,
      idempotencyKey: "test-idem-1",
    };
    const first = await runInTransaction((em) => recordEarn(em, earnInput));
    const balanceAfterFirst = (
      await readBalanceReport(db.manager, MEMBERSHIP_A_ID)
    ).projected;

    const replay = await runInTransaction((em) => recordEarn(em, earnInput));

    expect(replay.id).toBe(first.id);
    const report = await readBalanceReport(db.manager, MEMBERSHIP_A_ID);
    expect(report.projected).toBe(balanceAfterFirst);
    expect(await countRowsWithKey(db, "test-idem-1")).toBe(1);
  }, 15_000);

  it("rolls back both the entry and the projection when the unit of work fails", async () => {
    const before = await readBalanceReport(db.manager, MEMBERSHIP_A_ID);

    await expect(
      runInTransaction(async (em) => {
        await recordEarn(em, {
          merchantId: MERCHANT_A_ID,
          membershipId: MEMBERSHIP_A_ID,
          unit: "POINTS",
          delta: 50,
          idempotencyKey: "test-rollback",
        });
        throw new Error("simulated failure after append");
      }),
    ).rejects.toThrow("simulated failure after append");

    const after = await readBalanceReport(db.manager, MEMBERSHIP_A_ID);
    expect(after).toEqual(before);
    expect(await countRowsWithKey(db, "test-rollback")).toBe(0);
  }, 15_000);

  it("requires a reason for adjustments", async () => {
    await expect(
      runInTransaction((em) =>
        recordAdjustment(em, {
          merchantId: MERCHANT_A_ID,
          membershipId: MEMBERSHIP_A_ID,
          unit: "POINTS",
          delta: -5,
          reason: "   ",
          createdBy: OWNER_ID,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  }, 15_000);

  it("corrects history with reversing adjustments instead of editing rows", async () => {
    const before = await readBalanceReport(db.manager, MEMBERSHIP_A_ID);
    const rowsBefore = await countLedgerRows(db, MEMBERSHIP_A_ID);

    await runInTransaction((em) =>
      recordAdjustment(em, {
        merchantId: MERCHANT_A_ID,
        membershipId: MEMBERSHIP_A_ID,
        unit: "POINTS",
        delta: -30,
        reason: "cashier entered the wrong amount",
        createdBy: OWNER_ID,
        idempotencyKey: "test-adjust-1",
      }),
    );
    await runInTransaction((em) =>
      recordAdjustment(em, {
        merchantId: MERCHANT_A_ID,
        membershipId: MEMBERSHIP_A_ID,
        unit: "POINTS",
        delta: 30,
        reason: "reversal of test-adjust-1",
        createdBy: OWNER_ID,
        idempotencyKey: "test-adjust-2",
      }),
    );

    const after = await readBalanceReport(db.manager, MEMBERSHIP_A_ID);
    expect(after.projected).toBe(before.projected);
    expect(after.inSync).toBe(true);
    expect(await countLedgerRows(db, MEMBERSHIP_A_ID)).toBe(rowsBefore + 2);
  }, 15_000);

  it("rejects spending more than the balance without writing anything", async () => {
    const before = await readBalanceReport(db.manager, MEMBERSHIP_A_ID);

    await expect(
      runInTransaction((em) =>
        recordRedemption(em, {
          merchantId: MERCHANT_A_ID,
          membershipId: MEMBERSHIP_A_ID,
          unit: "POINTS",
          delta: -(before.projected + 1),
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    const after = await readBalanceReport(db.manager, MEMBERSHIP_A_ID);
    expect(after).toEqual(before);
  }, 15_000);

  it("refuses to write a foreign tenant's membership", async () => {
    const balanceA = await readBalanceReport(db.manager, MEMBERSHIP_A_ID);

    await expect(
      runInTransaction((em) =>
        recordEarn(em, {
          merchantId: MERCHANT_A_ID,
          membershipId: MEMBERSHIP_B_ID,
          unit: "STAMPS",
          delta: 5,
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // The rightful tenant can still write to its own membership.
    await runInTransaction((em) =>
      recordEarn(em, {
        merchantId: MERCHANT_B_ID,
        membershipId: MEMBERSHIP_B_ID,
        unit: "STAMPS",
        delta: 10,
        idempotencyKey: "test-earn-b-1",
      }),
    );

    const reportB = await readBalanceReport(db.manager, MEMBERSHIP_B_ID);
    expect(reportB).toMatchObject({ projected: 10, ledger: 10, inSync: true });
    expect(await readBalanceReport(db.manager, MEMBERSHIP_A_ID)).toEqual(
      balanceA,
    );
  }, 15_000);

  it("rejects incoherent type/unit/sign combinations before touching the database", async () => {
    await expect(
      runInTransaction((em) =>
        appendLedgerEntry(em, {
          merchantId: MERCHANT_A_ID,
          membershipId: MEMBERSHIP_A_ID,
          unit: "POINTS",
          type: "STAMP_EARNED",
          delta: 5,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      runInTransaction((em) =>
        appendLedgerEntry(em, {
          merchantId: MERCHANT_A_ID,
          membershipId: MEMBERSHIP_A_ID,
          unit: "POINTS",
          type: "POINTS_EARNED",
          delta: -5,
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  }, 15_000);

  it("keeps ledger history immutable at the database level", async () => {
    const rows = await db.query<Array<{ id: string }>>(
      `SELECT id FROM loyalty_transaction WHERE membership_id = $1 LIMIT 1`,
      [MEMBERSHIP_A_ID],
    );
    const firstEntry = rows[0];
    if (!firstEntry) throw new Error("expected a fixture ledger row");

    await expect(
      db.query(`UPDATE loyalty_transaction SET delta = 1 WHERE id = $1`, [
        firstEntry.id,
      ]),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.query(`DELETE FROM loyalty_transaction WHERE id = $1`, [
        firstEntry.id,
      ]),
    ).rejects.toThrow(/append-only/);
  }, 15_000);

  it("refuses ledger rows without a tenant at the database level", async () => {
    await expect(
      db.query(
        `INSERT INTO loyalty_transaction (membership_id, customer_profile_id, type, unit, delta)
         VALUES ($1, $2, 'POINTS_EARNED', 'POINTS', 1)`,
        [MEMBERSHIP_A_ID, PROFILE_A_ID],
      ),
    ).rejects.toThrow(/merchant_id/);
  }, 15_000);

  it("refuses incoherent ledger entries at the database level", async () => {
    await expect(
      db.query(
        `INSERT INTO loyalty_transaction (merchant_id, membership_id, customer_profile_id, type, unit, delta)
         VALUES ($1, $2, $3, 'POINTS_EARNED', 'POINTS', -5)`,
        [MERCHANT_A_ID, MEMBERSHIP_A_ID, PROFILE_A_ID],
      ),
    ).rejects.toThrow(/ck_loyalty_transaction_delta_sign/);
  }, 15_000);

  it("serialises concurrent redemptions so the balance never goes negative", async () => {
    const before = await readBalanceReport(db.manager, MEMBERSHIP_A_ID);
    const affordable = Math.floor(before.projected / 10);
    const attempts = affordable + 5;

    const results = await Promise.allSettled(
      Array.from({ length: attempts }, (_, index) =>
        runInTransaction((em) =>
          recordRedemption(em, {
            merchantId: MERCHANT_A_ID,
            membershipId: MEMBERSHIP_A_ID,
            unit: "POINTS",
            delta: -10,
            idempotencyKey: `test-concurrent-${index}`,
          }),
        ),
      ),
    );

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<LoyaltyTransaction> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(affordable);
    expect(rejected).toHaveLength(attempts - affordable);
    for (const failure of rejected) {
      expect(failure.reason).toBeInstanceOf(ConflictError);
    }

    const after = await assertProjectionMatchesLedger(
      db.manager,
      MEMBERSHIP_A_ID,
    );
    expect(after.projected).toBe(before.projected - 10 * affordable);
    expect(after.ledger).toBe(after.projected);
  }, 30_000);

  it("reconciles the projection against the ledger after every operation", async () => {
    const report = await assertProjectionMatchesLedger(
      db.manager,
      MEMBERSHIP_A_ID,
    );
    expect(report.inSync).toBe(true);
    expect(await computeBalanceFromLedger(db.manager, MEMBERSHIP_A_ID)).toBe(
      report.projected,
    );

    const types = await db.query<Array<{ type: string }>>(
      `SELECT DISTINCT type FROM loyalty_transaction WHERE membership_id = $1 ORDER BY type`,
      [MEMBERSHIP_A_ID],
    );
    expect(types.map((row) => row.type)).toEqual([
      "POINTS_ADJUSTED",
      "POINTS_EARNED",
      "POINTS_REDEEMED",
    ]);
  }, 15_000);
});
