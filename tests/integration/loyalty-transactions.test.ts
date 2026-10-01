import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthContext } from "@/auth/context";
import { closeDb, getDb } from "@/db/connection";
import { CustomerProfileEntity } from "@/db/entities/customer-profile.entity";
import {
  DomainEventOutboxEntity,
  type DomainEventOutbox,
} from "@/db/entities/domain-event-outbox.entity";
import { LoyaltyMembershipEntity } from "@/db/entities/loyalty-membership.entity";
import { LoyaltyProgramEntity } from "@/db/entities/loyalty-program.entity";
import { LoyaltyTransactionEntity } from "@/db/entities/loyalty-transaction.entity";
import { MerchantEntity } from "@/db/entities/merchant.entity";
import { UserEntity } from "@/db/entities/user.entity";
import { assertProjectionMatchesLedger, readBalanceReport } from "@/db/ledger";
import { runInTransaction } from "@/db/transactions";
import {
  adjustBalance,
  listTenantTransactions,
  previewPurchase,
  recordPurchase,
  reverseLedgerEntry,
} from "@/features/loyalty/transactions";
import {
  dispatchOutbox,
  listOutbox,
  registerDomainEventHandler,
  type DomainEventEnvelope,
} from "@/lib/domain-events";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

import { isPostgresReachable } from "../helpers/services";

/**
 * Staff transaction service suite (checklist §8).
 *
 * `src/features/loyalty/transactions.ts` is the only authority for earning,
 * adjusting and reversing value, so the assertions here are about the
 * guarantees that authority has to make:
 *
 *   - the award is recalculated from the *stored* active rules, never from a
 *     client number, and every input is validated first;
 *   - a cashier submission applies exactly once — replayed, and concurrent,
 *     under one idempotency key — while the balance and the ledger stay in
 *     step;
 *   - manual adjustments require `transactions.adjust` plus a reason, and are
 *     appended as ledger entries rather than edits;
 *   - every read carries the tenant predicate;
 *   - the outbox row commits with the entry, and delivery happens only after
 *     commit — a failed subscriber leaves the event pending with a backoff
 *     instead of failing the purchase.
 *
 * Fixtures use fixed ids and are purged before/after the suite. Ledger rows
 * cannot be deleted while the append-only trigger is armed, so the purge uses
 * the documented maintenance procedure (docs/database.md).
 */

const postgresReachable = await isPostgresReachable();

if (!postgresReachable) {
  console.warn(
    "[test] PostgreSQL is not reachable — skipping the loyalty transactions suite. Start local services with `pnpm services:up`.",
  );
}

const OWNER_ID = "test_tx_owner";
const STAFF_ID = "test_tx_staff";
const CUSTOMER_ID = "test_tx_customer";
const OTHER_CUSTOMER_ID = "test_tx_other_customer";

const MERCHANT_ID = "a2222222-0000-4000-8000-000000000001";
const OTHER_MERCHANT_ID = "a2222222-0000-4000-8000-000000000002";
const PROFILE_ID = "b2222222-0000-4000-8000-000000000001";
const OTHER_PROFILE_ID = "b2222222-0000-4000-8000-000000000002";
const PROGRAM_ID = "c2222222-0000-4000-8000-000000000001";
const OTHER_PROGRAM_ID = "c2222222-0000-4000-8000-000000000002";
const MEMBERSHIP_ID = "d2222222-0000-4000-8000-000000000001";
const OTHER_MEMBERSHIP_ID = "d2222222-0000-4000-8000-000000000002";

const FIXTURE_USER_IDS = [OWNER_ID, STAFF_ID, CUSTOMER_ID, OTHER_CUSTOMER_ID];
const FIXTURE_MERCHANT_IDS = [MERCHANT_ID, OTHER_MERCHANT_ID];

/**
 * 10 points per currency unit, floored, minimum purchase 5 — so
 * `12.34` earns `floor(123.4) = 123` and anything under 5 earns nothing.
 */
const POINTS_CONFIGURATION = {
  pointsPerEuro: 10,
  rounding: "FLOOR",
  minimumPurchase: 5,
  expiryMonths: 12,
  redemptionThresholds: [{ cost: 100, label: "$5 off" }],
};

function auth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: OWNER_ID,
    role: "MERCHANT_OWNER",
    displayName: "Transaction Test Owner",
    merchantId: MERCHANT_ID,
    preview: false,
    ...overrides,
  };
}

/**
 * Purging a fixture requires deleting ledger rows, which the append-only
 * trigger normally forbids.
 *
 * Instead of `ALTER TABLE … DISABLE TRIGGER` — shared DDL that would race
 * with `tests/integration/ledger.test.ts`, which arms and disarms the same
 * triggers — this lifts *row triggers for this session only* with
 * `set_config('session_replication_role', 'replica', true)`, transaction-local
 * and invisible to every other connection. Requires the superuser the local
 * test database already uses.
 */
async function purgeFixtures(db: DataSource): Promise<void> {
  await db.transaction(async (em) => {
    await em.query(
      `SELECT set_config('session_replication_role', 'replica', true)`,
    );

    for (const merchantId of FIXTURE_MERCHANT_IDS) {
      // The outbox has a RESTRICT foreign key to the merchant: it goes first.
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
  const users: Array<{
    id: string;
    name: string;
    role: "MERCHANT" | "CUSTOMER";
  }> = [
    { id: OWNER_ID, name: "Transaction Test Owner", role: "MERCHANT" },
    { id: STAFF_ID, name: "Counter Staff", role: "MERCHANT" },
    { id: CUSTOMER_ID, name: "Test Member", role: "CUSTOMER" },
    { id: OTHER_CUSTOMER_ID, name: "Other Member", role: "CUSTOMER" },
  ];
  for (const user of users) {
    await db.manager.insert(UserEntity, {
      id: user.id,
      name: user.name,
      email: `${user.id}@tx.test`,
      emailVerified: true,
      image: null,
      role: user.role,
      status: "active",
    });
  }

  await db.manager.insert(MerchantEntity, {
    id: MERCHANT_ID,
    name: "Transaction Test Café",
    slug: "transaction-test-cafe",
    currency: "EUR",
    timezone: "UTC",
    status: "active",
  });
  await db.manager.insert(MerchantEntity, {
    id: OTHER_MERCHANT_ID,
    name: "Transaction Test Roasters",
    slug: "transaction-test-roasters",
    currency: "EUR",
    timezone: "UTC",
    status: "active",
  });

  await db.manager.insert(CustomerProfileEntity, {
    id: PROFILE_ID,
    userId: CUSTOMER_ID,
    name: "Test Member",
  });
  await db.manager.insert(CustomerProfileEntity, {
    id: OTHER_PROFILE_ID,
    userId: OTHER_CUSTOMER_ID,
    name: "Other Member",
  });

  for (const [id, merchantId, name] of [
    [PROGRAM_ID, MERCHANT_ID, "Test Points Program"],
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

  for (const [id, merchantId, customerProfileId] of [
    [MEMBERSHIP_ID, MERCHANT_ID, PROFILE_ID],
    [OTHER_MEMBERSHIP_ID, OTHER_MERCHANT_ID, OTHER_PROFILE_ID],
  ] as const) {
    await db.manager.insert(LoyaltyMembershipEntity, {
      id,
      merchantId,
      customerProfileId,
      balance: 0,
      status: "active",
    });
  }
}

async function countLedgerRows(
  db: DataSource,
  where: Record<string, unknown>,
): Promise<number> {
  return db.manager.count(LoyaltyTransactionEntity, { where });
}

async function balanceOf(
  db: DataSource,
  membershipId: string,
): Promise<number> {
  const membership = await db.manager.findOneBy(LoyaltyMembershipEntity, {
    id: membershipId,
  });
  return membership?.balance ?? -1;
}

async function outboxRows(db: DataSource): Promise<DomainEventOutbox[]> {
  return db.manager.find(DomainEventOutboxEntity, {
    where: { merchantId: MERCHANT_ID },
    order: { createdAt: "ASC" },
  });
}

describe.skipIf(!postgresReachable)(
  "Staff transaction service (checklist §8)",
  () => {
    let db: DataSource;
    let firstEntryId: string;

    beforeAll(async () => {
      db = await getDb();
      await purgeFixtures(db);
      await createFixtures(db);
    });

    afterAll(async () => {
      if (db) await purgeFixtures(db);
      await closeDb();
    });

    it("recalculates the award from the stored active rules in a preview", async () => {
      const preview = await previewPurchase(db.manager, auth(), {
        membershipId: MEMBERSHIP_ID,
        amount: 12.34,
      });

      expect(preview.qualified).toBe(true);
      expect(preview.delta).toBe(123);
      expect(preview.unit).toBe("POINTS");
      expect(preview.unitName).toBe("points");
      expect(preview.amount).toBe(12.34);
      expect(preview.currency).toBe("EUR");
      expect(preview.balanceBefore).toBe(0);
      expect(preview.balanceAfter).toBe(123);
      expect(preview.ruleVersion).toBe(1);
      expect(preview.customerName).toBe("Test Member");

      // A preview writes nothing.
      expect(await countLedgerRows(db, { merchantId: MERCHANT_ID })).toBe(0);
      expect(await outboxRows(db)).toHaveLength(0);
    });

    it("validates the purchase before calculating anything", async () => {
      await expect(
        previewPurchase(db.manager, auth(), {
          membershipId: MEMBERSHIP_ID,
          amount: -1,
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        previewPurchase(db.manager, auth(), {
          membershipId: MEMBERSHIP_ID,
          amount: "12.345",
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        previewPurchase(db.manager, auth(), {
          membershipId: MEMBERSHIP_ID,
          amount: 10,
          currency: "USD",
        }),
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        previewPurchase(db.manager, auth(), {
          membershipId: "not-a-uuid",
          amount: 10,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("reports a purchase below the minimum as earning nothing", async () => {
      const preview = await previewPurchase(db.manager, auth(), {
        membershipId: MEMBERSHIP_ID,
        amount: 2,
      });

      expect(preview.qualified).toBe(false);
      expect(preview.delta).toBe(0);
      expect(preview.message).toContain("5.00");
      expect(await countLedgerRows(db, { merchantId: MERCHANT_ID })).toBe(0);
    });

    it("appends the entry, advances the balance and enqueues the event atomically", async () => {
      const outcome = await runInTransaction((em) =>
        recordPurchase(em, auth(), {
          membershipId: MEMBERSHIP_ID,
          amount: 12.34,
          idempotencyKey: "test-tx-key-0001",
        }),
      );

      expect(outcome.replayed).toBe(false);
      expect(outcome.entry.type).toBe("POINTS_EARNED");
      expect(outcome.entry.delta).toBe(123);
      expect(Number(outcome.entry.purchaseAmount)).toBe(12.34);
      expect(outcome.entry.currency).toBe("EUR");
      expect(outcome.entry.idempotencyKey).toBe("test-tx-key-0001");
      expect(outcome.entry.createdBy).toBe(OWNER_ID);
      expect(outcome.entry.metadata).toMatchObject({ source: "register" });
      expect(outcome.balance).toBe(123);

      firstEntryId = outcome.entry.id;

      const membership = await db.manager.findOneBy(LoyaltyMembershipEntity, {
        id: MEMBERSHIP_ID,
      });
      expect(membership?.balance).toBe(123);

      const [event] = await outboxRows(db);
      expect(event).toBeDefined();
      expect(event?.status).toBe("PENDING");
      expect(event?.eventType).toBe("loyalty.transaction.created");
      expect(event?.aggregateId).toBe(outcome.entry.id);
      expect(event?.idempotencyKey).toBe(
        `loyalty.transaction.created:${outcome.entry.id}`,
      );
      expect(event?.payload).toMatchObject({
        source: "register",
        type: "POINTS_EARNED",
        delta: 123,
        unit: "POINTS",
        membershipId: MEMBERSHIP_ID,
      });
    });

    it("applies a repeated submission exactly once", async () => {
      const replay = await runInTransaction((em) =>
        recordPurchase(em, auth(), {
          membershipId: MEMBERSHIP_ID,
          amount: 12.34,
          idempotencyKey: "test-tx-key-0001",
        }),
      );

      expect(replay.replayed).toBe(true);
      expect(replay.entry.id).toBe(firstEntryId);
      expect(replay.balance).toBe(123);

      expect(
        await countLedgerRows(db, {
          merchantId: MERCHANT_ID,
          idempotencyKey: "test-tx-key-0001",
        }),
      ).toBe(1);
      expect(await balanceOf(db, MEMBERSHIP_ID)).toBe(123);
      expect(await outboxRows(db)).toHaveLength(1);

      // The same key for a *different* purchase is a client bug, not a replay.
      await expect(
        runInTransaction((em) =>
          recordPurchase(em, auth(), {
            membershipId: MEMBERSHIP_ID,
            amount: 10,
            idempotencyKey: "test-tx-key-0001",
          }),
        ),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(await balanceOf(db, MEMBERSHIP_ID)).toBe(123);
    });

    it("serialises concurrent submissions of the same purchase", async () => {
      const key = "test-tx-key-concurrent";
      const submit = () =>
        runInTransaction((em) =>
          recordPurchase(em, auth(), {
            membershipId: MEMBERSHIP_ID,
            amount: 10,
            idempotencyKey: key,
          }),
        );

      const [first, second] = await Promise.all([submit(), submit()]);

      expect(first.entry.id).toBe(second.entry.id);
      expect(
        await countLedgerRows(db, {
          merchantId: MERCHANT_ID,
          idempotencyKey: key,
        }),
      ).toBe(1);
      // 123 from the first purchase + 10 × 10 from this one — awarded once.
      expect(await balanceOf(db, MEMBERSHIP_ID)).toBe(223);
      expect(await outboxRows(db)).toHaveLength(2);
      await assertProjectionMatchesLedger(db.manager, MEMBERSHIP_ID);
    });

    it("lists the tenant history with a field-limited projection", async () => {
      const rows = await listTenantTransactions(auth(), { group: "earn" });

      expect(rows).toHaveLength(2);
      expect(rows[0]?.amountLabel).toBe("+100 points");
      expect(rows[0]?.customerName).toBe("Test Member");
      expect(rows[0]?.recordedBy).toBe("Transaction Test Owner");
      expect(rows[0]?.detail).toContain("Purchase");

      // Field-level limits: the projection exposes display values only.
      const keys = Object.keys(rows[0] ?? {});
      expect(keys).not.toContain("idempotencyKey");
      expect(keys).not.toContain("metadata");
      expect(keys).not.toContain("externalRef");

      // No active tenant → 403, never "some other store's" rows.
      await expect(
        listTenantTransactions(auth({ merchantId: null }), {}),
      ).rejects.toBeInstanceOf(ForbiddenError);

      expect(
        await listTenantTransactions(auth(), { group: "adjustment" }),
      ).toHaveLength(0);
    });

    it("keeps another tenant's membership and history unreachable", async () => {
      await expect(
        previewPurchase(db.manager, auth(), {
          membershipId: OTHER_MEMBERSHIP_ID,
          amount: 10,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);

      await runInTransaction((em) =>
        recordPurchase(em, auth({ merchantId: OTHER_MERCHANT_ID }), {
          membershipId: OTHER_MEMBERSHIP_ID,
          amount: 20,
          idempotencyKey: "test-tx-key-other-tenant",
        }),
      );
      expect(await balanceOf(db, OTHER_MEMBERSHIP_ID)).toBe(200);

      const mine = await listTenantTransactions(auth(), {});
      expect(mine.some((row) => row.customerName === "Other Member")).toBe(
        false,
      );
      expect(await listOutbox(db.manager, OTHER_MERCHANT_ID)).toHaveLength(1);
      expect(await outboxRows(db)).toHaveLength(2);
    });

    it("refuses manual adjustments without the capability or a valid reason", async () => {
      await expect(
        runInTransaction((em) =>
          adjustBalance(em, auth({ role: "MERCHANT_STAFF" }), {
            membershipId: MEMBERSHIP_ID,
            delta: 25,
            reason: "Goodwill for a delayed order",
            idempotencyKey: "test-tx-adj-0001",
          }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenError);

      await expect(
        runInTransaction((em) =>
          adjustBalance(em, auth(), {
            membershipId: MEMBERSHIP_ID,
            delta: 0,
            reason: "Goodwill for a delayed order",
            idempotencyKey: "test-tx-adj-0002",
          }),
        ),
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        runInTransaction((em) =>
          adjustBalance(em, auth(), {
            membershipId: MEMBERSHIP_ID,
            delta: 10.5,
            reason: "Goodwill for a delayed order",
            idempotencyKey: "test-tx-adj-0003",
          }),
        ),
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        runInTransaction((em) =>
          adjustBalance(em, auth(), {
            membershipId: MEMBERSHIP_ID,
            delta: 25,
            reason: "x",
            idempotencyKey: "test-tx-adj-0004",
          }),
        ),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(await balanceOf(db, MEMBERSHIP_ID)).toBe(223);
    });

    it("records an authorised adjustment as a ledger entry with its reason", async () => {
      const outcome = await runInTransaction((em) =>
        adjustBalance(em, auth(), {
          membershipId: MEMBERSHIP_ID,
          delta: 25,
          reason: "Goodwill for a delayed order",
          idempotencyKey: "test-tx-adj-0001",
        }),
      );

      expect(outcome.entry.type).toBe("POINTS_ADJUSTED");
      expect(outcome.entry.delta).toBe(25);
      expect(outcome.entry.reason).toBe("Goodwill for a delayed order");
      expect(outcome.balance).toBe(248);

      const rows = await listTenantTransactions(auth(), {
        group: "adjustment",
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.detail).toBe("Goodwill for a delayed order");

      // Replaying the same adjustment changes nothing.
      const replay = await runInTransaction((em) =>
        adjustBalance(em, auth(), {
          membershipId: MEMBERSHIP_ID,
          delta: 25,
          reason: "Goodwill for a delayed order",
          idempotencyKey: "test-tx-adj-0001",
        }),
      );
      expect(replay.replayed).toBe(true);
      expect(await balanceOf(db, MEMBERSHIP_ID)).toBe(248);
      expect(await outboxRows(db)).toHaveLength(3);
    });

    it("corrects a mistaken earn by appending the opposite entry", async () => {
      const outcome = await runInTransaction((em) =>
        reverseLedgerEntry(em, auth(), {
          entryId: firstEntryId,
          reason: "Duplicate award corrected at the counter",
          idempotencyKey: "test-tx-rev-0001",
        }),
      );

      expect(outcome.original.id).toBe(firstEntryId);
      expect(outcome.reversal.delta).toBe(-123);
      expect(outcome.reversal.reason).toBe(
        "Duplicate award corrected at the counter",
      );
      expect(outcome.balance).toBe(125);

      // The original row is untouched — history is append-only.
      const original = await db.manager.findOneBy(LoyaltyTransactionEntity, {
        id: firstEntryId,
      });
      expect(original?.delta).toBe(123);
      expect(original?.type).toBe("POINTS_EARNED");

      await assertProjectionMatchesLedger(db.manager, MEMBERSHIP_ID);
    });

    it("rolls the outbox row back with the ledger entry it describes", async () => {
      const before = await outboxRows(db);

      await expect(
        runInTransaction(async (em) => {
          await recordPurchase(em, auth(), {
            membershipId: MEMBERSHIP_ID,
            amount: 9.99,
            idempotencyKey: "test-tx-key-rollback",
          });
          throw new Error("unit of work failed");
        }),
      ).rejects.toThrow("unit of work failed");

      expect(await outboxRows(db)).toHaveLength(before.length);
      expect(
        await countLedgerRows(db, {
          merchantId: MERCHANT_ID,
          idempotencyKey: "test-tx-key-rollback",
        }),
      ).toBe(0);
      expect(await balanceOf(db, MEMBERSHIP_ID)).toBe(125);
    });

    it("delivers committed events only after the transaction commits", async () => {
      const received: DomainEventEnvelope[] = [];
      const off = registerDomainEventHandler(
        "loyalty.transaction.created",
        (event) => {
          if (event.merchantId === MERCHANT_ID) received.push(event);
        },
      );

      try {
        const outcome = await dispatchOutbox();
        expect(outcome.delivered).toBeGreaterThanOrEqual(1);
      } finally {
        off();
      }

      expect(received.length).toBeGreaterThanOrEqual(1);
      expect(received[0]?.payload).toMatchObject({ unit: "POINTS" });
      expect(received[0]?.aggregateType).toBe("loyalty_transaction");

      const rows = await outboxRows(db);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.status === "DELIVERED")).toBe(true);
      expect(rows.every((row) => row.deliveredAt !== null)).toBe(true);
    });

    it("keeps a failed delivery pending with a backoff instead of failing the write", async () => {
      await runInTransaction((em) =>
        recordPurchase(em, auth(), {
          membershipId: MEMBERSHIP_ID,
          amount: 6,
          idempotencyKey: "test-tx-key-retry",
        }),
      );

      const off = registerDomainEventHandler(
        "loyalty.transaction.created",
        () => {
          throw new Error("subscriber offline");
        },
      );
      try {
        const outcome = await dispatchOutbox();
        expect(outcome.retried).toBeGreaterThanOrEqual(1);
      } finally {
        off();
      }

      const pending = (await outboxRows(db)).filter(
        (row) => row.status === "PENDING",
      );
      expect(pending).toHaveLength(1);
      expect(pending[0]?.attempts).toBe(1);
      expect(pending[0]?.lastError).toContain("subscriber offline");
      expect(pending[0]?.status).not.toBe("FAILED");
      expect(pending[0]?.availableAt.getTime()).toBeGreaterThan(Date.now());

      // The purchase that produced the event is untouched by the failure.
      expect(await balanceOf(db, MEMBERSHIP_ID)).toBe(185);
      await assertProjectionMatchesLedger(db.manager, MEMBERSHIP_ID);
    });

    it("refuses transactions while the program is not active", async () => {
      await db.manager.update(
        LoyaltyProgramEntity,
        { id: PROGRAM_ID },
        { status: "draft" },
      );
      try {
        await expect(
          previewPurchase(db.manager, auth(), {
            membershipId: MEMBERSHIP_ID,
            amount: 10,
          }),
        ).rejects.toBeInstanceOf(ConflictError);

        await expect(
          runInTransaction((em) =>
            recordPurchase(em, auth(), {
              membershipId: MEMBERSHIP_ID,
              amount: 10,
              idempotencyKey: "test-tx-key-inactive",
            }),
          ),
        ).rejects.toBeInstanceOf(ConflictError);
      } finally {
        await db.manager.update(
          LoyaltyProgramEntity,
          { id: PROGRAM_ID },
          { status: "active" },
        );
      }
      expect(await balanceOf(db, MEMBERSHIP_ID)).toBe(185);
    });

    it("refuses transactions for a suspended store", async () => {
      await db.manager.update(
        MerchantEntity,
        { id: MERCHANT_ID },
        { status: "suspended" },
      );
      try {
        await expect(
          previewPurchase(db.manager, auth(), {
            membershipId: MEMBERSHIP_ID,
            amount: 10,
          }),
        ).rejects.toBeInstanceOf(ConflictError);
      } finally {
        await db.manager.update(
          MerchantEntity,
          { id: MERCHANT_ID },
          { status: "active" },
        );
      }
    });

    it("keeps the projection reconciled with the ledger at the end", async () => {
      const report = await readBalanceReport(db.manager, MEMBERSHIP_ID);
      expect(report.inSync).toBe(true);
      expect(report.projected).toBe(185);
      expect(report.ledger).toBe(185);
    });
  },
);
