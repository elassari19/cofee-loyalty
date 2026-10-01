import { createHash } from "node:crypto";
import { AppDataSource } from "../src/db/data-source";
import {
  readBalanceReport,
  recordAdjustment,
  recordEarn,
  recordRewardRedemption,
} from "../src/db/ledger";
import { runInTransaction } from "../src/db/transactions";

/**
 * Repeatable development seed: `pnpm db:seed`.
 *
 * Design rules (checklist §4 — "Add seeded development data through
 * repeatable CLI scripts; never seed production with default credentials"):
 *
 * - **Refuses to run outside a local development database** and when
 *   `NODE_ENV=production`, so the script cannot become an accidental
 *   production writer.
 * - **Idempotent**: every row uses a fixed id with `ON CONFLICT DO NOTHING`,
 *   and every ledger movement goes through the real ledger API with a
 *   deterministic idempotency key — re-running the seed replays entries
 *   instead of double-counting them, and the balances stay identical.
 * - **No credentials**: the user rows carry no passwords (credential tables
 *   arrive with checklist §5, which provisions them through Better Auth).
 *   Nothing in this file may ever become a "default" production login.
 * - Seeded ledger history demonstrates both loyalty types: Café Luna runs
 *   `POINTS`, Roast & Co runs `STAMPS`, and one customer identity joins both
 *   merchants with two isolated memberships.
 */

const ADMIN_ID = "seed_admin";
const LUNA_OWNER_ID = "seed_owner_luna";
const LUNA_STAFF_ID = "seed_staff_luna";
const AMINA_ID = "seed_customer_amina";
const ROAST_OWNER_ID = "seed_owner_roast";

const MERCHANT_LUNA_ID = "5eed0000-0000-4000-8000-000000000011";
const MERCHANT_ROAST_ID = "5eed0000-0000-4000-8000-000000000012";
const PROFILE_AMINA_ID = "5eed0000-0000-4000-8000-000000000021";
const MEMBERSHIP_LUNA_ID = "5eed0000-0000-4000-8000-000000000031";
const MEMBERSHIP_ROAST_ID = "5eed0000-0000-4000-8000-000000000032";
const PROGRAM_LUNA_ID = "5eed0000-0000-4000-8000-000000000041";
const PROGRAM_ROAST_ID = "5eed0000-0000-4000-8000-000000000042";
const REWARD_PASTRY_ID = "5eed0000-0000-4000-8000-000000000051";
const REWARD_DISCOUNT_ID = "5eed0000-0000-4000-8000-000000000052";
const REWARD_ESPRESSO_ID = "5eed0000-0000-4000-8000-000000000053";
const REDEMPTION_PASTRY_ID = "5eed0000-0000-4000-8000-000000000061";
const REDEMPTION_ESPRESSO_ID = "5eed0000-0000-4000-8000-000000000062";
const CAMPAIGN_LUNA_ID = "5eed0000-0000-4000-8000-000000000071";
const AUDIT_SEED_ID = "5eed0000-0000-4000-8000-000000000081";
const INTEGRATION_POS_ID = "5eed0000-0000-4000-8000-000000000091";
const LUNA_OWNER_MEMBERSHIP_ID = "5eed0000-0000-4000-8000-0000000000a1";
const LUNA_STAFF_MEMBERSHIP_ID = "5eed0000-0000-4000-8000-0000000000a2";
const ROAST_OWNER_MEMBERSHIP_ID = "5eed0000-0000-4000-8000-0000000000a3";

/** Dev-only redemption codes, shown once in the seed output. */
const PASTRY_CODE = "SEED-PASTRY-0001";
const ESPRESSO_CODE = "SEED-ESPRESSO-0001";

function codeHash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function assertSafeToSeed(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed while NODE_ENV=production. This script creates development data only.",
    );
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required to seed.");
  }
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(
      `Refusing to seed a non-local database (host: ${host}). Point DATABASE_URL at your local development instance.`,
    );
  }
}

async function seedIdentityAndTenants(): Promise<void> {
  await AppDataSource.query(`
    INSERT INTO "user" (id, name, email, email_verified, role, status) VALUES
      ('${ADMIN_ID}', 'Platform Admin', 'admin@loyalty.local', true, 'SUPER_ADMIN', 'active'),
      ('${LUNA_OWNER_ID}', 'Luna Owner', 'owner@cafe-luna.local', true, 'MERCHANT', 'active'),
      ('${LUNA_STAFF_ID}', 'Luna Barista', 'staff@cafe-luna.local', true, 'MERCHANT', 'active'),
      ('${AMINA_ID}', 'Amina Rahal', 'amina@customer.local', true, 'CUSTOMER', 'active'),
      ('${ROAST_OWNER_ID}', 'Roast Owner', 'owner@roast-and-co.local', true, 'MERCHANT', 'active')
    ON CONFLICT (id) DO NOTHING
  `);

  await AppDataSource.query(`
    INSERT INTO merchant (id, name, slug, description, category, currency, timezone, status) VALUES
      ('${MERCHANT_LUNA_ID}', 'Café Luna', 'cafe-luna', 'Neighborhood café with a loyalty program.', 'cafe', 'EUR', 'UTC', 'active'),
      ('${MERCHANT_ROAST_ID}', 'Roast & Co', 'roast-and-co', 'Specialty coffee roastery running a stamp card.', 'coffee', 'EUR', 'UTC', 'active')
    ON CONFLICT (id) DO NOTHING
  `);

  await AppDataSource.query(`
    INSERT INTO merchant_membership (id, merchant_id, user_id, role, status) VALUES
      ('${LUNA_OWNER_MEMBERSHIP_ID}', '${MERCHANT_LUNA_ID}', '${LUNA_OWNER_ID}', 'MERCHANT_OWNER', 'active'),
      ('${LUNA_STAFF_MEMBERSHIP_ID}', '${MERCHANT_LUNA_ID}', '${LUNA_STAFF_ID}', 'MERCHANT_STAFF', 'active'),
      ('${ROAST_OWNER_MEMBERSHIP_ID}', '${MERCHANT_ROAST_ID}', '${ROAST_OWNER_ID}', 'MERCHANT_OWNER', 'active')
    ON CONFLICT (id) DO NOTHING
  `);

  await AppDataSource.query(`
    INSERT INTO subscription (merchant_id, plan, status, limits, started_at) VALUES
      ('${MERCHANT_LUNA_ID}', 'FREE', 'active', '{}', now() - interval '30 days'),
      ('${MERCHANT_ROAST_ID}', 'FREE', 'active', '{}', now() - interval '30 days')
    ON CONFLICT (merchant_id) DO NOTHING
  `);
}

async function seedCustomersAndPrograms(): Promise<void> {
  // One platform identity; two merchants — memberships stay isolated.
  await AppDataSource.query(`
    INSERT INTO customer_profile (id, user_id, name, phone) VALUES
      ('${PROFILE_AMINA_ID}', '${AMINA_ID}', 'Amina Rahal', '+31612345678')
    ON CONFLICT (id) DO NOTHING
  `);

  await AppDataSource.query(`
    INSERT INTO loyalty_membership (id, merchant_id, customer_profile_id) VALUES
      ('${MEMBERSHIP_LUNA_ID}', '${MERCHANT_LUNA_ID}', '${PROFILE_AMINA_ID}'),
      ('${MEMBERSHIP_ROAST_ID}', '${MERCHANT_ROAST_ID}', '${PROFILE_AMINA_ID}')
    ON CONFLICT (id) DO NOTHING
  `);

  await AppDataSource.query(`
    INSERT INTO loyalty_program (id, merchant_id, type, name, description, unit_name, configuration, rule_version, status)
    VALUES
      ('${PROGRAM_LUNA_ID}', '${MERCHANT_LUNA_ID}', 'POINTS', 'Luna Points',
       'Earn 1 point per euro spent.', 'points',
       '{"pointsPerEuro": 1, "rounding": "FLOOR", "minimumPurchase": 5, "expiryMonths": null, "redemptionThresholds": [{"cost": 100, "label": "Free coffee"}, {"cost": 250, "label": "Free pastry + coffee"}]}'::jsonb,
       1, 'active'),
      ('${PROGRAM_ROAST_ID}', '${MERCHANT_ROAST_ID}', 'STAMPS', 'Roast Stamp Card',
       'One stamp per visit, free espresso at 10.', 'stamps',
       '{"requiredStamps": 10, "stampsPerPurchase": 1, "minimumPurchase": 0, "expiryMonths": null, "maximumStampsPerTransaction": 1}'::jsonb,
       1, 'active')
    ON CONFLICT (id) DO NOTHING
  `);

  await AppDataSource.query(`
    INSERT INTO reward (id, merchant_id, name, description, terms, cost, unit, status, redemption_count)
    VALUES
      ('${REWARD_PASTRY_ID}', '${MERCHANT_LUNA_ID}', 'Free pastry', 'Any single pastry.', 'One per customer per month.', 100, 'POINTS', 'active', 1),
      ('${REWARD_DISCOUNT_ID}', '${MERCHANT_LUNA_ID}', '20% off next purchase', 'Applies to one order.', 'Cannot be combined.', 50, 'POINTS', 'active', 0),
      ('${REWARD_ESPRESSO_ID}', '${MERCHANT_ROAST_ID}', 'Free espresso', 'Any size.', 'In-store only.', 10, 'STAMPS', 'active', 1)
    ON CONFLICT (id) DO NOTHING
  `);

  await AppDataSource.query(`
    INSERT INTO reward_redemption (
      id, merchant_id, membership_id, reward_id, unit, cost, code_hash, status, expires_at,
      requested_by, verified_by, verified_at, redeemed_by, redeemed_at
    ) VALUES
      ('${REDEMPTION_PASTRY_ID}', '${MERCHANT_LUNA_ID}', '${MEMBERSHIP_LUNA_ID}', '${REWARD_PASTRY_ID}',
       'POINTS', 100, '${codeHash(PASTRY_CODE)}', 'REDEEMED', now() + interval '7 days',
       '${AMINA_ID}', '${LUNA_STAFF_ID}', now() - interval '1 hour', '${LUNA_STAFF_ID}', now() - interval '30 minutes'),
      ('${REDEMPTION_ESPRESSO_ID}', '${MERCHANT_ROAST_ID}', '${MEMBERSHIP_ROAST_ID}', '${REWARD_ESPRESSO_ID}',
       'STAMPS', 10, '${codeHash(ESPRESSO_CODE)}', 'REDEEMED', now() + interval '7 days',
       '${AMINA_ID}', '${ROAST_OWNER_ID}', now() - interval '1 hour', '${ROAST_OWNER_ID}', now() - interval '30 minutes')
    ON CONFLICT (id) DO NOTHING
  `);
}

async function seedLedger(): Promise<void> {
  // Café Luna — points. Deterministic idempotency keys make reruns no-ops.
  await runInTransaction((em) =>
    recordEarn(em, {
      merchantId: MERCHANT_LUNA_ID,
      membershipId: MEMBERSHIP_LUNA_ID,
      unit: "POINTS",
      delta: 120,
      purchaseAmount: 30,
      currency: "EUR",
      programId: PROGRAM_LUNA_ID,
      ruleVersion: 1,
      createdBy: LUNA_STAFF_ID,
      idempotencyKey: "seed:luna:earn:1",
      externalRef: "seed-luna-pos-001",
    }),
  );
  await runInTransaction((em) =>
    recordEarn(em, {
      merchantId: MERCHANT_LUNA_ID,
      membershipId: MEMBERSHIP_LUNA_ID,
      unit: "POINTS",
      delta: 80,
      purchaseAmount: 20,
      currency: "EUR",
      programId: PROGRAM_LUNA_ID,
      ruleVersion: 1,
      createdBy: LUNA_STAFF_ID,
      idempotencyKey: "seed:luna:earn:2",
    }),
  );
  await runInTransaction((em) =>
    recordAdjustment(em, {
      merchantId: MERCHANT_LUNA_ID,
      membershipId: MEMBERSHIP_LUNA_ID,
      unit: "POINTS",
      delta: 15,
      reason: "Opening week goodwill credit",
      programId: PROGRAM_LUNA_ID,
      ruleVersion: 1,
      createdBy: LUNA_OWNER_ID,
      idempotencyKey: "seed:luna:adjust:1",
    }),
  );
  await runInTransaction((em) =>
    recordRewardRedemption(em, {
      merchantId: MERCHANT_LUNA_ID,
      membershipId: MEMBERSHIP_LUNA_ID,
      unit: "POINTS",
      delta: -100,
      rewardId: REWARD_PASTRY_ID,
      redemptionId: REDEMPTION_PASTRY_ID,
      programId: PROGRAM_LUNA_ID,
      ruleVersion: 1,
      createdBy: LUNA_STAFF_ID,
      idempotencyKey: "seed:luna:redeem:1",
    }),
  );

  // Roast & Co — stamps: twelve visits, then the free espresso at 10.
  for (let visit = 1; visit <= 12; visit += 1) {
    await runInTransaction((em) =>
      recordEarn(em, {
        merchantId: MERCHANT_ROAST_ID,
        membershipId: MEMBERSHIP_ROAST_ID,
        unit: "STAMPS",
        delta: 1,
        programId: PROGRAM_ROAST_ID,
        ruleVersion: 1,
        createdBy: ROAST_OWNER_ID,
        idempotencyKey: `seed:roast:visit:${visit}`,
      }),
    );
  }
  await runInTransaction((em) =>
    recordRewardRedemption(em, {
      merchantId: MERCHANT_ROAST_ID,
      membershipId: MEMBERSHIP_ROAST_ID,
      unit: "STAMPS",
      delta: -10,
      rewardId: REWARD_ESPRESSO_ID,
      redemptionId: REDEMPTION_ESPRESSO_ID,
      programId: PROGRAM_ROAST_ID,
      ruleVersion: 1,
      createdBy: ROAST_OWNER_ID,
      idempotencyKey: "seed:roast:redeem:1",
    }),
  );
}

async function seedOperationalRows(): Promise<void> {
  await AppDataSource.query(`
    INSERT INTO campaign (id, merchant_id, name, description, terms, audience, configuration, start_at, end_at, status)
    VALUES (
      '${CAMPAIGN_LUNA_ID}', '${MERCHANT_LUNA_ID}', 'Opening week double points',
      'Double points on every purchase during the opening week.',
      'Valid in-store only.', 'ALL_CUSTOMERS', '{}'::jsonb,
      now() - interval '1 day', now() + interval '6 days', 'ACTIVE'
    )
    ON CONFLICT (id) DO NOTHING
  `);

  await AppDataSource.query(`
    INSERT INTO integration_record (id, merchant_id, provider, entity_type, entity_id, external_id, metadata)
    VALUES (
      '${INTEGRATION_POS_ID}', '${MERCHANT_LUNA_ID}', 'demo-pos', 'loyalty_membership',
      '${MEMBERSHIP_LUNA_ID}', 'pos-member-0001', '{}'::jsonb
    )
    ON CONFLICT (provider, merchant_id, external_id) DO NOTHING
  `);

  await AppDataSource.query(`
    INSERT INTO audit_log (id, merchant_id, actor_id, actor_role, action, resource, resource_id, metadata)
    VALUES (
      '${AUDIT_SEED_ID}', '${MERCHANT_LUNA_ID}', '${ADMIN_ID}', 'SUPER_ADMIN',
      'seed.run', 'database', 'scripts/seed.ts', '{"source": "scripts/seed.ts"}'::jsonb
    )
    ON CONFLICT (id) DO NOTHING
  `);
}

async function report(): Promise<void> {
  const luna = await readBalanceReport(
    AppDataSource.manager,
    MEMBERSHIP_LUNA_ID,
  );
  const roast = await readBalanceReport(
    AppDataSource.manager,
    MEMBERSHIP_ROAST_ID,
  );

  for (const [name, report_] of [
    ["Café Luna (points)", luna],
    ["Roast & Co (stamps)", roast],
  ] as const) {
    const sync = report_.inSync ? "reconciled" : "OUT OF SYNC";
    console.log(
      `[seed] ${name}: balance ${report_.projected} (ledger ${report_.ledger}, ${sync})`,
    );
  }

  const counts = await AppDataSource.query<
    Array<{ table_name: string; count: number }>
  >(`
    SELECT 'users' AS table_name, count(*)::int AS count FROM "user"
    UNION ALL SELECT 'merchants', count(*)::int FROM merchant
    UNION ALL SELECT 'loyalty_memberships', count(*)::int FROM loyalty_membership
    UNION ALL SELECT 'loyalty_transactions', count(*)::int FROM loyalty_transaction
    UNION ALL SELECT 'rewards', count(*)::int FROM reward
    UNION ALL SELECT 'reward_redemptions', count(*)::int FROM reward_redemption
  `);
  for (const row of counts) {
    console.log(`[seed] ${row.table_name}: ${row.count}`);
  }

  console.log(
    `[seed] Demo redemption codes (development only): ${PASTRY_CODE}, ${ESPRESSO_CODE}`,
  );
  console.log(
    "[seed] Users have no passwords yet — credentials are provisioned by the auth layer (checklist §5).",
  );
}

async function main(): Promise<void> {
  assertSafeToSeed();
  await AppDataSource.initialize();
  try {
    if (await AppDataSource.showMigrations()) {
      throw new Error(
        "Pending migrations detected. Run `pnpm db:migrate` before seeding.",
      );
    }

    await seedIdentityAndTenants();
    await seedCustomersAndPrograms();
    await seedLedger();
    await seedOperationalRows();
    await report();

    console.log("[seed] Done — re-running this script is a safe no-op.");
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    "[seed] Failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
