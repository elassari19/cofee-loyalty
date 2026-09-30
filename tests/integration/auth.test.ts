import { NextRequest } from "next/server";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getAuth } from "@/auth/config";
import {
  destinationFor,
  performRequestPasswordReset,
  performResetPassword,
  performSignIn,
  performSignOut,
  performSignUp,
  performSetActiveMerchant,
  performVerifyEmail,
  type FlowCall,
} from "@/auth/flows";
import { withApiGuard } from "@/auth/guard";
import {
  listTenantCandidates,
  resolveSession,
  ACTIVE_MERCHANT_COOKIE,
} from "@/auth/session";
import {
  requireTenant,
  scopedCount,
  scopedFind,
  scopedFindOrFail,
  scopedList,
} from "@/auth/tenant";
import { closeDb, getDb } from "@/db/connection";
import { CampaignEntity } from "@/db/entities/campaign.entity";
import { CustomerProfileEntity } from "@/db/entities/customer-profile.entity";
import { LoyaltyMembershipEntity } from "@/db/entities/loyalty-membership.entity";
import { LoyaltyProgramEntity } from "@/db/entities/loyalty-program.entity";
import { LoyaltyTransactionEntity } from "@/db/entities/loyalty-transaction.entity";
import { MerchantEntity } from "@/db/entities/merchant.entity";
import { MerchantMembershipEntity } from "@/db/entities/merchant-membership.entity";
import { RewardEntity } from "@/db/entities/reward.entity";
import { RewardRedemptionEntity } from "@/db/entities/reward-redemption.entity";
import { lastCaptured } from "@/integrations/email";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { resetRateLimits } from "@/lib/rate-limit";
import { isPostgresReachable } from "../helpers/services";

/**
 * Authentication, session and tenant-isolation suite (checklist §5).
 *
 * It drives the real flows — registration, sign-in, reset, verification,
 * sign-out — through `src/auth/flows.ts` against a live PostgreSQL, then
 * asserts the two guarantees the section is judged on:
 *
 *   - identity: sessions expire, get revoked, and a suspended account stops
 *     resolving; nothing about roles can be claimed from the client;
 *   - isolation: every tenant-scoped read only ever sees the caller's rows,
 *     an id from another merchant reads as "not found", and a session without
 *     an active tenant is refused outright.
 *
 * Rate limits are active during these tests, so every call gets its own
 * client address; the limiter state is reset before the suite runs.
 */

const postgresReachable = await isPostgresReachable();

if (!postgresReachable) {
  console.warn(
    "[test] PostgreSQL is not reachable — skipping the authentication suite. Start local services with `pnpm services:up`.",
  );
}

const MERCHANT_A_ID = "e1111111-0000-4000-8000-000000000001";
const MERCHANT_B_ID = "e1111111-0000-4000-8000-000000000002";
const PROGRAM_A_ID = "e4444444-0000-4000-8000-000000000001";
const PROGRAM_B_ID = "e4444444-0000-4000-8000-000000000002";
const REWARD_A_ID = "e5555555-0000-4000-8000-000000000001";
const REWARD_B_ID = "e5555555-0000-4000-8000-000000000002";
const CAMPAIGN_A_ID = "e6666666-0000-4000-8000-000000000001";
const CAMPAIGN_B_ID = "e6666666-0000-4000-8000-000000000002";
const REDEMPTION_A_ID = "e7777777-0000-4000-8000-000000000001";
const REDEMPTION_B_ID = "e7777777-0000-4000-8000-000000000002";
const PROFILE_A_ID = "e2222222-0000-4000-8000-000000000001";
const PROFILE_B_ID = "e2222222-0000-4000-8000-000000000002";
const MEMBERSHIP_A_ID = "e3333333-0000-4000-8000-000000000001";
const MEMBERSHIP_B_ID = "e3333333-0000-4000-8000-000000000002";
const TXN_A_ID = "e9999999-0000-4000-8000-000000000001";
const TXN_B_ID = "e9999999-0000-4000-8000-000000000002";

const MERCHANT_IDS = [MERCHANT_A_ID, MERCHANT_B_ID];
const TENANT_TABLES = [
  "loyalty_transaction",
  "reward_redemption",
  "loyalty_membership",
  "loyalty_program",
  "reward",
  "campaign",
  "merchant_membership",
  "subscription",
  "integration_record",
  "audit_log",
];

const APPEND_ONLY_TRIGGERS = [
  {
    table: "loyalty_transaction",
    trigger: "trg_loyalty_transaction_append_only",
  },
  { table: "audit_log", trigger: "trg_audit_log_append_only" },
] as const;

const PASSWORD = "correct-horse-battery-staple";

interface FlowHarness {
  call: FlowCall;
  /** Request headers reflecting the cookies the flow wrote. */
  requestHeaders(): Headers;
  cookies: Map<string, string>;
}

let ipCursor = 10 + (Date.now() % 200);
function nextIp(): string {
  ipCursor += 1;
  return `203.0.113.${(ipCursor % 250) + 1}`;
}

function harness(ip = nextIp()): FlowHarness {
  const headers = new Headers({
    origin: "http://localhost:3000",
    "x-forwarded-for": ip,
  });
  const cookies = new Map<string, string>();

  const setCookie = (entry: string) => {
    const parts = entry.split(";");
    const pair = parts[0] ?? "";
    const attributes = parts.slice(1);
    const separator = pair.indexOf("=");
    if (separator < 0) return;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    const expired = attributes.some((attribute) =>
      attribute.trim().toLowerCase().startsWith("max-age=0"),
    );
    if (expired || value === "") cookies.delete(name);
    else cookies.set(name, value);
  };

  return {
    cookies,
    call: {
      headers,
      readCookie: (name) => cookies.get(name),
      setCookie,
    },
    requestHeaders: () => {
      const request = new Headers({ origin: "http://localhost:3000" });
      if (cookies.size > 0) {
        request.set(
          "cookie",
          [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
        );
      }
      return request;
    },
  };
}

function sessionInput(harness: FlowHarness) {
  return {
    headers: harness.requestHeaders(),
    readCookie: (name: string) => harness.cookies.get(name),
  };
}

async function waitForEmail(
  kind: "password-reset" | "email-verification",
  recipient: string,
): Promise<string> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const message = lastCaptured(kind);
    if (message && message.to === recipient) return message.link;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`no ${kind} email captured for ${recipient}`);
}

function tokenFromLink(link: string): string {
  const token = new URL(link).searchParams.get("token");
  if (!token) throw new Error(`link has no token: ${link}`);
  return token;
}

async function withTriggersDisabled(
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

describe.skipIf(!postgresReachable)("Authentication (checklist §5)", () => {
  let db: DataSource;
  const registeredEmails: string[] = [];

  /** Registers an account the way the sign-up page does, with its own IP. */
  async function register(name: string, email: string): Promise<string> {
    registeredEmails.push(email);
    const result = await performSignUp({
      name,
      email,
      password: PASSWORD,
      ...harness().call,
    });
    if (!result.ok) throw new Error(`sign-up failed: ${result.message}`);
    const rows = await db.query<Array<{ id: string }>>(
      `SELECT id FROM "user" WHERE email = $1`,
      [email],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error("registered user not found");
    return id;
  }

  async function purge(): Promise<void> {
    await withTriggersDisabled(db, async () => {
      for (const merchantId of MERCHANT_IDS) {
        for (const table of TENANT_TABLES) {
          await db.query(`DELETE FROM ${table} WHERE merchant_id = $1`, [
            merchantId,
          ]);
        }
        await db.query(`DELETE FROM merchant WHERE id = $1`, [merchantId]);
      }
      for (const email of registeredEmails) {
        await db.query(`DELETE FROM verification WHERE identifier = $1`, [
          email,
        ]);
        await db.query(
          `DELETE FROM customer_profile WHERE user_id IN (
            SELECT id FROM "user" WHERE email = $1)`,
          [email],
        );
        await db.query(
          `DELETE FROM merchant_membership WHERE user_id IN (
             SELECT id FROM "user" WHERE email = $1)`,
          [email],
        );
        await db.query(`DELETE FROM "user" WHERE email = $1`, [email]);
      }
    });
  }

  beforeAll(async () => {
    await resetRateLimits();
    db = await getDb();
    await purge();

    // Two tenants, each with an owner, a customer profile, a programme and
    // one row of every tenant-owned resource the section must isolate.
    await db.manager.insert(MerchantEntity, {
      id: MERCHANT_A_ID,
      name: "Auth Suite Café",
      slug: "auth-suite-cafe",
      currency: "EUR",
      timezone: "UTC",
      status: "active",
    });
    await db.manager.insert(MerchantEntity, {
      id: MERCHANT_B_ID,
      name: "Auth Suite Roasters",
      slug: "auth-suite-roasters",
      currency: "EUR",
      timezone: "UTC",
      status: "active",
    });

    await db.manager.insert(LoyaltyProgramEntity, {
      id: PROGRAM_A_ID,
      merchantId: MERCHANT_A_ID,
      type: "POINTS",
      name: "Auth Suite Points",
      ruleVersion: 1,
      status: "active",
    });
    await db.manager.insert(LoyaltyProgramEntity, {
      id: PROGRAM_B_ID,
      merchantId: MERCHANT_B_ID,
      type: "POINTS",
      name: "Auth Suite Points B",
      ruleVersion: 1,
      status: "active",
    });

    await db.manager.insert(RewardEntity, {
      id: REWARD_A_ID,
      merchantId: MERCHANT_A_ID,
      name: "Free pastry",
      cost: 100,
      unit: "POINTS",
      status: "active",
    });
    await db.manager.insert(RewardEntity, {
      id: REWARD_B_ID,
      merchantId: MERCHANT_B_ID,
      name: "Free bag",
      cost: 250,
      unit: "POINTS",
      status: "active",
    });

    await db.manager.insert(CampaignEntity, {
      id: CAMPAIGN_A_ID,
      merchantId: MERCHANT_A_ID,
      name: "Double points",
      startAt: new Date("2026-01-01T00:00:00Z"),
      endAt: new Date("2026-12-31T00:00:00Z"),
      status: "ACTIVE",
    });
    await db.manager.insert(CampaignEntity, {
      id: CAMPAIGN_B_ID,
      merchantId: MERCHANT_B_ID,
      name: "Winter bonus",
      startAt: new Date("2026-01-01T00:00:00Z"),
      endAt: new Date("2026-12-31T00:00:00Z"),
      status: "ACTIVE",
    });
  }, 30_000);

  afterAll(async () => {
    if (db) await purge();
    await resetRateLimits();
    if (db) await closeDb();
  }, 30_000);

  describe("registration and sign-in", () => {
    it("creates an ordinary customer account", async () => {
      const email = `authz_signup_${Date.now()}@example.test`;
      const userId = await register("Auth Suite Customer", email);

      const rows = await db.query<
        Array<{
          role: string;
          status: string;
          emailVerified: boolean;
        }>
      >(
        `SELECT role, status, email_verified AS "emailVerified" FROM "user" WHERE id = $1`,
        [userId],
      );
      expect(rows[0]).toEqual({
        role: "CUSTOMER",
        status: "active",
        emailVerified: false,
      });

      const audit = await db.query<Array<{ count: number }>>(
        `SELECT count(*)::int AS count FROM audit_log
          WHERE action = 'auth.registered' AND actor_id = $1`,
        [userId],
      );
      expect(audit[0]?.count).toBe(1);
    });

    it("cannot be used to claim a privileged role", async () => {
      const email = `authz_escalate_${Date.now()}@example.test`;
      registeredEmails.push(email);

      // Whatever the client sends, the row lands with the database default.
      const outcome = await (async () => {
        try {
          await getAuth().api.signUpEmail({
            body: {
              name: "Escalation Attempt",
              email,
              password: PASSWORD,
              role: "SUPER_ADMIN",
              status: "invited",
            } as never,
          });
          return "created" as const;
        } catch {
          return "rejected" as const;
        }
      })();

      const rows = await db.query<Array<{ role: string; status: string }>>(
        `SELECT role, status FROM "user" WHERE email = $1`,
        [email],
      );
      if (outcome === "created") {
        expect(rows[0]).toEqual({ role: "CUSTOMER", status: "active" });
      } else {
        expect(rows).toHaveLength(0);
      }
    });

    it("signs in, resolves the session and picks a destination", async () => {
      const email = `authz_signin_${Date.now()}@example.test`;
      await register("Auth Suite Signin", email);

      const flow = harness();
      const result = await performSignIn({
        email,
        password: PASSWORD,
        ...flow.call,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // The session cookie must actually reach the caller — without it the
      // browser would be anonymous on the very next request.
      expect(flow.cookies.has("better-auth.session_token")).toBe(true);

      const context = await resolveSession(sessionInput(flow));
      expect(context).not.toBeNull();
      expect(context?.role).toBe("CUSTOMER");
      expect(context?.preview).toBe(false);
      expect(destinationFor(context)).toBe("/me");
    });

    it("answers an unknown account and a wrong password identically", async () => {
      const email = `authz_unknown_${Date.now()}@example.test`;
      await register("Auth Suite Known", email);

      const wrongPassword = await performSignIn({
        email,
        password: "not-the-password",
        ...harness().call,
      });
      const unknownAccount = await performSignIn({
        email: `authz_nobody_${Date.now()}@example.test`,
        password: PASSWORD,
        ...harness().call,
      });

      expect(wrongPassword.ok).toBe(false);
      expect(unknownAccount.ok).toBe(false);
      if (wrongPassword.ok || unknownAccount.ok) return;
      expect(wrongPassword.message).toBe(unknownAccount.message);
      expect(wrongPassword.code).toBe("invalid");
    });

    it("throttles repeated sign-in attempts from one address", async () => {
      const email = `authz_throttle_${Date.now()}@example.test`;
      await register("Auth Suite Throttle", email);

      const flow = harness();
      let last: Awaited<ReturnType<typeof performSignIn>> | undefined;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        last = await performSignIn({
          email,
          password: "wrong-password",
          ...flow.call,
        });
        if (!last.ok && last.code === "rate_limited") break;
      }

      expect(last?.ok).toBe(false);
      if (!last || last.ok) return;
      expect(last.code).toBe("rate_limited");
    });
  });

  describe("sessions", () => {
    let email: string;
    let userId: string;
    let flow: FlowHarness;

    beforeAll(async () => {
      email = `authz_session_${Date.now()}@example.test`;
      userId = await register("Auth Suite Session", email);
      flow = harness();
      const result = await performSignIn({
        email,
        password: PASSWORD,
        ...flow.call,
      });
      if (!result.ok) throw new Error(`sign-in failed: ${result.message}`);
    }, 15_000);

    it("stops resolving once the session has expired", async () => {
      expect(await resolveSession(sessionInput(flow))).not.toBeNull();

      await db.query(
        `UPDATE session SET expires_at = now() - interval '1 day'
          WHERE user_id = $1`,
        [userId],
      );

      expect(await resolveSession(sessionInput(flow))).toBeNull();

      // Sign in again for the remaining tests in this block.
      const again = harness();
      const result = await performSignIn({
        email,
        password: PASSWORD,
        ...again.call,
      });
      expect(result.ok).toBe(true);
      flow = again;
    }, 15_000);

    it("is revoked by sign-out", async () => {
      expect(await resolveSession(sessionInput(flow))).not.toBeNull();

      const result = await performSignOut(flow.call);
      expect(result.ok).toBe(true);
      // The session cookie is actively deleted, not left to rot.
      expect(flow.cookies.has("better-auth.session_token")).toBe(false);
      expect(await resolveSession(sessionInput(flow))).toBeNull();
    }, 15_000);

    it("stops resolving for a disabled account", async () => {
      const signIn = harness();
      expect(
        (
          await performSignIn({
            email,
            password: PASSWORD,
            ...signIn.call,
          })
        ).ok,
      ).toBe(true);
      expect(await resolveSession(sessionInput(signIn))).not.toBeNull();

      await db.query(`UPDATE "user" SET status = 'disabled' WHERE id = $1`, [
        userId,
      ]);

      expect(await resolveSession(sessionInput(signIn))).toBeNull();
      const attempt = await performSignIn({
        email,
        password: PASSWORD,
        ...harness().call,
      });
      expect(attempt.ok).toBe(false);

      await db.query(`UPDATE "user" SET status = 'active' WHERE id = $1`, [
        userId,
      ]);
    }, 15_000);
  });

  describe("password reset and email verification", () => {
    it("resets a password with the emailed token and rejects the old one", async () => {
      const email = `authz_reset_${Date.now()}@example.test`;
      await register("Auth Suite Reset", email);

      const request = await performRequestPasswordReset({
        email,
        ...harness().call,
      });
      expect(request.ok).toBe(true);

      const link = await waitForEmail("password-reset", email);
      const reset = await performResetPassword({
        token: tokenFromLink(link),
        newPassword: "another-long-enough-secret",
        ...harness().call,
      });
      expect(reset.ok).toBe(true);

      const oldPassword = await performSignIn({
        email,
        password: PASSWORD,
        ...harness().call,
      });
      expect(oldPassword.ok).toBe(false);

      const newPassword = await performSignIn({
        email,
        password: "another-long-enough-secret",
        ...harness().call,
      });
      expect(newPassword.ok).toBe(true);
    }, 20_000);

    it("verifies an email from the emailed link", async () => {
      const email = `authz_verify_${Date.now()}@example.test`;
      await register("Auth Suite Verify", email);

      const link = await waitForEmail("email-verification", email);
      const verify = await performVerifyEmail({
        token: tokenFromLink(link),
        ...harness().call,
      });
      expect(verify.ok).toBe(true);

      const rows = await db.query<Array<{ emailVerified: boolean }>>(
        `SELECT email_verified AS "emailVerified" FROM "user" WHERE email = $1`,
        [email],
      );
      expect(rows[0]?.emailVerified).toBe(true);
    }, 20_000);
  });

  describe("tenant isolation", () => {
    const ownerAEmail = `authz_owner_a_${Date.now()}@example.test`;
    const ownerBEmail = `authz_owner_b_${Date.now()}@example.test`;
    let ownerAContext: Awaited<ReturnType<typeof resolveSession>>;
    let ownerAFlow: FlowHarness;

    beforeAll(async () => {
      const ownerAId = await register("Auth Suite Owner A", ownerAEmail);
      const ownerBId = await register("Auth Suite Owner B", ownerBEmail);
      await db.query(`UPDATE "user" SET role = 'MERCHANT' WHERE id = ANY($1)`, [
        [ownerAId, ownerBId],
      ]);

      await db.manager.insert(MerchantMembershipEntity, {
        id: "e8888888-0000-4000-8000-000000000001",
        merchantId: MERCHANT_A_ID,
        userId: ownerAId,
        role: "MERCHANT_OWNER",
        status: "active",
      });
      await db.manager.insert(MerchantMembershipEntity, {
        id: "e8888888-0000-4000-8000-000000000002",
        merchantId: MERCHANT_B_ID,
        userId: ownerBId,
        role: "MERCHANT_OWNER",
        status: "active",
      });

      const customerIdA = await register(
        "Auth Suite Customer A",
        `authz_customer_a_${Date.now()}@example.test`,
      );
      const customerIdB = await register(
        "Auth Suite Customer B",
        `authz_customer_b_${Date.now()}@example.test`,
      );
      await db.manager.insert(CustomerProfileEntity, {
        id: PROFILE_A_ID,
        userId: customerIdA,
        name: "Auth Suite Customer A",
      });
      await db.manager.insert(CustomerProfileEntity, {
        id: PROFILE_B_ID,
        userId: customerIdB,
        name: "Auth Suite Customer B",
      });
      await db.manager.insert(LoyaltyMembershipEntity, {
        id: MEMBERSHIP_A_ID,
        merchantId: MERCHANT_A_ID,
        customerProfileId: PROFILE_A_ID,
        balance: 120,
      });
      await db.manager.insert(LoyaltyMembershipEntity, {
        id: MEMBERSHIP_B_ID,
        merchantId: MERCHANT_B_ID,
        customerProfileId: PROFILE_B_ID,
        balance: 340,
      });
      await db.manager.insert(LoyaltyTransactionEntity, {
        id: TXN_A_ID,
        merchantId: MERCHANT_A_ID,
        membershipId: MEMBERSHIP_A_ID,
        customerProfileId: PROFILE_A_ID,
        programId: PROGRAM_A_ID,
        ruleVersion: 1,
        type: "POINTS_EARNED",
        unit: "POINTS",
        delta: 120,
        metadata: {},
      });
      await db.manager.insert(LoyaltyTransactionEntity, {
        id: TXN_B_ID,
        merchantId: MERCHANT_B_ID,
        membershipId: MEMBERSHIP_B_ID,
        customerProfileId: PROFILE_B_ID,
        programId: PROGRAM_B_ID,
        ruleVersion: 1,
        type: "POINTS_EARNED",
        unit: "POINTS",
        delta: 340,
        metadata: {},
      });
      await db.manager.insert(RewardRedemptionEntity, {
        id: REDEMPTION_A_ID,
        merchantId: MERCHANT_A_ID,
        membershipId: MEMBERSHIP_A_ID,
        rewardId: REWARD_A_ID,
        unit: "POINTS",
        cost: 100,
        codeHash: "a".repeat(64),
        status: "ISSUED",
      });
      await db.manager.insert(RewardRedemptionEntity, {
        id: REDEMPTION_B_ID,
        merchantId: MERCHANT_B_ID,
        membershipId: MEMBERSHIP_B_ID,
        rewardId: REWARD_B_ID,
        unit: "POINTS",
        cost: 250,
        codeHash: "b".repeat(64),
        status: "ISSUED",
      });

      ownerAFlow = harness();
      const signIn = await performSignIn({
        email: ownerAEmail,
        password: PASSWORD,
        ...ownerAFlow.call,
      });
      if (!signIn.ok)
        throw new Error(`owner sign-in failed: ${signIn.message}`);
      ownerAContext = await resolveSession(sessionInput(ownerAFlow));
      if (!ownerAContext) throw new Error("owner session did not resolve");
    }, 30_000);

    it("resolves the owner's tenant from the session, not the client", () => {
      expect(ownerAContext?.merchantId).toBe(MERCHANT_A_ID);
      expect(ownerAContext?.role).toBe("MERCHANT_OWNER");
      expect(destinationFor(ownerAContext)).toBe("/dashboard");
    });

    it("refuses to act without an active tenant", () => {
      const withoutTenant = {
        ...ownerAContext!,
        merchantId: null,
      };
      expect(() => requireTenant(withoutTenant)).toThrow(ForbiddenError);
    });

    it("never reads another merchant's rows", async () => {
      const auth = ownerAContext!;

      // The row exists — in merchant B — and must read as absent.
      expect(await scopedFind(auth, RewardEntity, REWARD_B_ID)).toBeNull();
      expect(await scopedFind(auth, CampaignEntity, CAMPAIGN_B_ID)).toBeNull();
      expect(
        await scopedFind(auth, RewardRedemptionEntity, REDEMPTION_B_ID),
      ).toBeNull();
      expect(
        await scopedFind(auth, LoyaltyTransactionEntity, TXN_B_ID),
      ).toBeNull();
      expect(
        await scopedFind(auth, LoyaltyMembershipEntity, MEMBERSHIP_B_ID),
      ).toBeNull();
      expect(
        await scopedFind(auth, LoyaltyProgramEntity, PROGRAM_B_ID),
      ).toBeNull();

      // Customer data is reached through the membership and the ledger, both
      // of which are tenant-scoped.
      expect(
        await scopedFind(auth, LoyaltyTransactionEntity, TXN_A_ID),
      ).not.toBeNull();

      // …and the caller's own rows are all there.
      expect(await scopedFind(auth, RewardEntity, REWARD_A_ID)).not.toBeNull();
      expect(
        await scopedFind(auth, CampaignEntity, CAMPAIGN_A_ID),
      ).not.toBeNull();

      // List and count carry the same predicate.
      const rewards = await scopedList(auth, RewardEntity);
      expect(rewards.map((reward) => reward.id)).toEqual([REWARD_A_ID]);
      expect(await scopedCount(auth, RewardEntity)).toBe(1);
      expect(await scopedCount(auth, RewardRedemptionEntity)).toBe(1);
      expect(await scopedCount(auth, LoyaltyTransactionEntity)).toBe(1);
    }, 20_000);

    it("answers a cross-tenant id with 404, not with a hint", async () => {
      const auth = ownerAContext!;
      await expect(
        scopedFindOrFail(auth, RewardEntity, REWARD_B_ID),
      ).rejects.toThrow(NotFoundError);
    });

    it("drops a suspended merchant from the candidate list", async () => {
      const candidates = await listTenantCandidates({
        id: ownerAContext!.userId,
        role: "MERCHANT",
      });
      expect(candidates.map((candidate) => candidate.merchantId)).toEqual([
        MERCHANT_A_ID,
      ]);

      await db.query(`UPDATE merchant SET status = 'suspended' WHERE id = $1`, [
        MERCHANT_A_ID,
      ]);
      expect(
        await listTenantCandidates({
          id: ownerAContext!.userId,
          role: "MERCHANT",
        }),
      ).toEqual([]);
      await db.query(`UPDATE merchant SET status = 'active' WHERE id = $1`, [
        MERCHANT_A_ID,
      ]);
    }, 15_000);

    it("only lets the session choose among its own tenants", async () => {
      const denied = await performSetActiveMerchant({
        auth: { ...ownerAContext!, merchantId: null },
        merchantId: MERCHANT_B_ID,
        ...ownerAFlow.call,
      });
      expect(denied.ok).toBe(false);
      if (denied.ok) return;
      expect(denied.code).toBe("forbidden");

      const allowed = await performSetActiveMerchant({
        auth: { ...ownerAContext!, merchantId: null },
        merchantId: MERCHANT_A_ID,
        ...ownerAFlow.call,
      });
      expect(allowed.ok).toBe(true);
      // The choice only ever lands in the validated tenant cookie.
      expect(ownerAFlow.cookies.get(ACTIVE_MERCHANT_COOKIE)).toBe(
        MERCHANT_A_ID,
      );
    }, 15_000);

    it("rejects anonymous API calls and cross-tenant reads", async () => {
      const readReward = withApiGuard(
        "rewards.read",
        async (_req, _ctx, auth) => {
          const reward = await scopedFindOrFail(
            auth,
            RewardEntity,
            REWARD_B_ID,
          );
          return Response.json({ id: reward.id });
        },
      );

      const anonymous = await readReward(
        new NextRequest("http://localhost/api/rewards/any"),
        {},
      );
      expect(anonymous.status).toBe(401);
      const anonymousBody = (await anonymous.json()) as {
        error: { code: string };
      };
      expect(anonymousBody.error.code).toBe("unauthorized");

      // Owner A is authenticated but the row belongs to merchant B.
      const crossTenant = await readReward(
        new NextRequest("http://localhost/api/rewards/any", {
          headers: ownerAFlow.requestHeaders(),
        }),
        {},
      );
      expect(crossTenant.status).toBe(404);

      // A capability the owner's role does not hold.
      const platformApi = withApiGuard("platform.manage", () =>
        Response.json({ ok: true }),
      );
      const forbidden = await platformApi(
        new NextRequest("http://localhost/api/platform/overview", {
          headers: ownerAFlow.requestHeaders(),
        }),
        {},
      );
      expect(forbidden.status).toBe(403);
      const forbiddenBody = (await forbidden.json()) as {
        error: { code: string };
      };
      expect(forbiddenBody.error.code).toBe("forbidden");
    }, 20_000);
  });
});
