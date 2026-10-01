import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthContext } from "@/auth/context";
import { recordEarn } from "@/db/ledger";
import { closeDb, getDb } from "@/db/connection";
import { CustomerProfileEntity } from "@/db/entities/customer-profile.entity";
import { LoyaltyIdentityTokenEntity } from "@/db/entities/loyalty-identity-token.entity";
import { LoyaltyMembershipEntity } from "@/db/entities/loyalty-membership.entity";
import { MerchantEntity } from "@/db/entities/merchant.entity";
import { UserEntity } from "@/db/entities/user.entity";
import { runInTransaction } from "@/db/transactions";
import { ConflictError } from "@/lib/errors";
import {
  enrollBySlug,
  listCustomerActivity,
  loadCustomerContext,
  resolveIdentityToken,
  resolveJoinTarget,
  rotateIdentityToken,
  type CustomerContext,
} from "@/features/customers/service";
import {
  identityQrPayload,
  isIdentityToken,
} from "@/features/customers/identity";

import { isPostgresReachable } from "../helpers/services";

const postgresReachable = await isPostgresReachable();
if (!postgresReachable) {
  console.warn(
    "[test] PostgreSQL is not reachable — skipping the enrollment suite. Run `pnpm services:up` to start it.",
  );
}

const SLUG_BASE = "enrollment-test";
const SLUG_A = `${SLUG_BASE}-alpha`;
const SLUG_B = `${SLUG_BASE}-beta`;
const SLUG_SUSPENDED = `${SLUG_BASE}-suspended`;
const MEMBER_ID = "test_enrollment_member";
const OTHER_ID = "test_enrollment_other";

function auth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: MEMBER_ID,
    role: "CUSTOMER",
    displayName: "Ada Lovelace",
    merchantId: null,
    preview: false,
    ...overrides,
  };
}

/** The one membership an authenticated member sees, or an explicit failure. */
async function readyMerchantContext(
  userId: string,
  merchantId: string,
): Promise<CustomerContext> {
  const state = await loadCustomerContext(auth({ userId, merchantId }));
  if (state.kind !== "ready") {
    throw new Error(`Expected a resolved customer view, got ${state.kind}`);
  }
  return state.ctx;
}

describe.skipIf(!postgresReachable)(
  "Customer enrollment and loyalty identity (checklist §7)",
  () => {
    let db: DataSource;
    let merchantA: string;
    let merchantB: string;

    /**
     * Fixture teardown. Ledger rows are append-only by trigger, so clearing
     * them is the same documented maintenance procedure the ledger suite uses
     * (docs/database.md): disable the trigger for the duration of the delete
     * and re-enable it afterwards — never leave it off.
     */
    async function purge(): Promise<void> {
      const slugs = `${SLUG_BASE}%`;
      const users = [MEMBER_ID, OTHER_ID];

      await db.query(
        `ALTER TABLE "loyalty_transaction" DISABLE TRIGGER "trg_loyalty_transaction_append_only"`,
      );
      try {
        await db.query(
          `DELETE FROM loyalty_identity_token
            WHERE merchant_id IN (SELECT id FROM merchant WHERE slug LIKE $1)
               OR customer_profile_id IN (SELECT id FROM customer_profile WHERE user_id = ANY($2::text[]))`,
          [slugs, users],
        );
        await db.query(
          `DELETE FROM loyalty_transaction
            WHERE merchant_id IN (SELECT id FROM merchant WHERE slug LIKE $1)
               OR customer_profile_id IN (SELECT id FROM customer_profile WHERE user_id = ANY($2::text[]))`,
          [slugs, users],
        );
        await db.query(
          `DELETE FROM loyalty_membership
            WHERE merchant_id IN (SELECT id FROM merchant WHERE slug LIKE $1)
               OR customer_profile_id IN (SELECT id FROM customer_profile WHERE user_id = ANY($2::text[]))`,
          [slugs, users],
        );
        await db.query(
          `DELETE FROM reward WHERE merchant_id IN (SELECT id FROM merchant WHERE slug LIKE $1)`,
          [slugs],
        );
        await db.query(
          `DELETE FROM loyalty_program WHERE merchant_id IN (SELECT id FROM merchant WHERE slug LIKE $1)`,
          [slugs],
        );
        await db.query(
          `DELETE FROM customer_profile WHERE user_id = ANY($1::text[])`,
          [users],
        );
        await db.query(`DELETE FROM merchant WHERE slug LIKE $1`, [slugs]);
        await db.query(`DELETE FROM "user" WHERE id = ANY($1::text[])`, [
          users,
        ]);
      } finally {
        await db.query(
          `ALTER TABLE "loyalty_transaction" ENABLE TRIGGER "trg_loyalty_transaction_append_only"`,
        );
      }
    }

    async function createMerchant(
      slug: string,
      status: "active" | "suspended" = "active",
    ): Promise<string> {
      const result = await db.manager.insert(MerchantEntity, {
        name: `Enrollment Test ${slug}`,
        slug,
        status,
        currency: "EUR",
        timezone: "UTC",
      });
      const id = result.identifiers[0]?.id;
      if (typeof id !== "string") throw new Error("merchant insert failed");
      return id;
    }

    beforeAll(async () => {
      db = await getDb();
      await purge();
      merchantA = await createMerchant(SLUG_A);
      merchantB = await createMerchant(SLUG_B);
      for (const id of [MEMBER_ID, OTHER_ID]) {
        await db.manager.insert(UserEntity, {
          id,
          name: id === MEMBER_ID ? "Ada Lovelace" : "Grace Hopper",
          email: `${id}@enrollment.test`,
          emailVerified: true,
          image: null,
          role: "CUSTOMER",
          status: "active",
        });
      }
    });

    afterAll(async () => {
      if (db) await purge();
      await closeDb();
    });

    it("creates one profile, one membership and one card per join URL", async () => {
      const first = await enrollBySlug({
        userId: MEMBER_ID,
        slug: SLUG_A,
        name: "Ada Lovelace",
        phone: "+44 20 7946 0018",
      });
      expect(first.merchantId).toBe(merchantA);
      expect(first.balance).toBe(0);
      expect(first.createdProfile).toBe(true);
      expect(first.createdMembership).toBe(true);
      expect(first.createdToken).toBe(true);
      expect(isIdentityToken(first.token)).toBe(true);
      expect(identityQrPayload(first.token)).toBe(
        `cofe://customer/${first.token}`,
      );

      const profile = await db.manager.findOneBy(CustomerProfileEntity, {
        userId: MEMBER_ID,
      });
      expect(profile?.name).toBe("Ada Lovelace");
      expect(profile?.phone).toBe("+44 20 7946 0018");
    });

    it("is idempotent: joining twice returns the same rows and creates nothing", async () => {
      const first = await enrollBySlug({ userId: MEMBER_ID, slug: SLUG_A });
      const second = await enrollBySlug({
        userId: MEMBER_ID,
        slug: SLUG_A,
        name: "An Impostor Name",
      });

      expect(second.profileId).toBe(first.profileId);
      expect(second.membershipId).toBe(first.membershipId);
      expect(second.token).toBe(first.token);
      expect(second.createdProfile).toBe(false);
      expect(second.createdMembership).toBe(false);
      expect(second.createdToken).toBe(false);

      const counts = await db.query<
        Array<{ profiles: string; memberships: string; tokens: string }>
      >(
        `SELECT (SELECT count(*) FROM customer_profile WHERE user_id = $1) AS profiles,
                (SELECT count(*) FROM loyalty_membership WHERE customer_profile_id = $2) AS memberships,
                (SELECT count(*) FROM loyalty_identity_token WHERE customer_profile_id = $2) AS tokens`,
        [MEMBER_ID, first.profileId],
      );
      expect(counts[0]).toEqual({
        profiles: "1",
        memberships: "1",
        tokens: "1",
      });

      // A repeat join must not rewrite the name the member already gave.
      const profile = await db.manager.findOneBy(CustomerProfileEntity, {
        userId: MEMBER_ID,
      });
      expect(profile?.name).toBe("Ada Lovelace");
    });

    it("resolves two simultaneous joins to the same membership", async () => {
      const [left, right] = await Promise.all([
        enrollBySlug({ userId: OTHER_ID, slug: SLUG_A, name: "Grace Hopper" }),
        enrollBySlug({ userId: OTHER_ID, slug: SLUG_A, name: "Grace Hopper" }),
      ]);

      expect(left.profileId).toBe(right.profileId);
      expect(left.membershipId).toBe(right.membershipId);
      expect(left.token).toBe(right.token);

      const memberships = await db.manager.count(LoyaltyMembershipEntity, {
        where: { merchantId: merchantA, customerProfileId: left.profileId },
      });
      expect(memberships).toBe(1);
    });

    it("keeps two programs apart — balances, cards and history never cross", async () => {
      const atB = await enrollBySlug({ userId: MEMBER_ID, slug: SLUG_B });
      expect(atB.merchantId).toBe(merchantB);

      const atA = await enrollBySlug({ userId: MEMBER_ID, slug: SLUG_A });
      expect(atA.membershipId).not.toBe(atB.membershipId);
      expect(atA.token).not.toBe(atB.token);

      // Move real value through the ledger so this asserts on production paths.
      await runInTransaction((em) =>
        recordEarn(em, {
          merchantId: merchantA,
          membershipId: atA.membershipId,
          unit: "POINTS",
          delta: 120,
          createdBy: MEMBER_ID,
        }),
      );
      await runInTransaction((em) =>
        recordEarn(em, {
          merchantId: merchantB,
          membershipId: atB.membershipId,
          unit: "POINTS",
          delta: 15,
          createdBy: MEMBER_ID,
        }),
      );

      const viewA = await readyMerchantContext(MEMBER_ID, merchantA);
      expect(viewA.membership.balance).toBe(120);
      expect(viewA.memberships).toHaveLength(2);
      expect(
        viewA.memberships.find((m) => m.merchantId === merchantA)?.active,
      ).toBe(true);
      expect(
        viewA.memberships.find((m) => m.merchantId === merchantB)?.active,
      ).toBe(false);

      const viewB = await readyMerchantContext(MEMBER_ID, merchantB);
      expect(viewB.membership.balance).toBe(15);
      expect(
        viewB.memberships.find((m) => m.merchantId === merchantB)?.active,
      ).toBe(true);

      // B's card resolves only where it belongs, and never under A's tenant.
      expect(
        await resolveIdentityToken(identityQrPayload(atB.token), {
          merchantId: merchantA,
        }),
      ).toBeNull();
      const unscoped = await resolveIdentityToken(identityQrPayload(atB.token));
      expect(unscoped?.membership.id).toBe(atB.membershipId);
      expect(unscoped?.merchant.id).toBe(merchantB);

      // Each program's own history: A has the member's earn, B has its own.
      const activityA = await listCustomerActivity(viewA);
      const activityB = await listCustomerActivity(viewB);
      expect(activityA).toHaveLength(1);
      expect(activityA[0]?.delta).toBe(120);
      expect(activityB).toHaveLength(1);
      expect(activityB[0]?.delta).toBe(15);
    });

    it("never shows one member another member's card or history", async () => {
      const otherView = await readyMerchantContext(OTHER_ID, merchantA);
      expect(otherView.membership.balance).toBe(0);
      expect(otherView.profile.name).toBe("Grace Hopper");

      const otherActivity = await listCustomerActivity(otherView);
      expect(otherActivity).toHaveLength(0);

      const memberCard = await db.manager.findOne(LoyaltyIdentityTokenEntity, {
        where: { merchantId: merchantA, status: "active" },
        order: { createdAt: "ASC" },
      });
      expect(memberCard?.issuedTo).toBe(MEMBER_ID);

      // The card itself belongs to the member — scanning it can never hand
      // back the identity that is asking.
      const resolved = await resolveIdentityToken(
        identityQrPayload(memberCard!.token),
        { merchantId: merchantA },
      );
      expect(resolved?.profile.userId).toBe(MEMBER_ID);
      expect(resolved?.profile.id).not.toBe(otherView.profile.id);
    });

    it("rotates the card: the old code stops resolving the moment a new one exists", async () => {
      const view = await readyMerchantContext(MEMBER_ID, merchantA);
      const before = await db.manager.findOne(LoyaltyIdentityTokenEntity, {
        where: { membershipId: view.membership.id, status: "active" },
      });
      expect(before).not.toBeNull();

      const rotated = await rotateIdentityToken({
        auth: auth({ merchantId: merchantA }),
        merchantId: merchantA,
      });
      expect(rotated.token).not.toBe(before!.token);
      expect(rotated.revokedCount).toBe(1);

      expect(
        await resolveIdentityToken(identityQrPayload(before!.token)),
      ).toBeNull();

      const after = await resolveIdentityToken(
        identityQrPayload(rotated.token),
      );
      expect(after?.membership.id).toBe(view.membership.id);
      expect(after?.merchant.id).toBe(merchantA);

      const activeCount = await db.manager.count(LoyaltyIdentityTokenEntity, {
        where: { membershipId: view.membership.id, status: "active" },
      });
      expect(activeCount).toBe(1);
    });

    it("refuses a suspended merchant's join link", async () => {
      const suspended = await createMerchant(SLUG_SUSPENDED, "suspended");
      const target = await resolveJoinTarget(SLUG_SUSPENDED);
      expect(target?.open).toBe(false);

      await expect(
        enrollBySlug({ userId: OTHER_ID, slug: SLUG_SUSPENDED }),
      ).rejects.toBeInstanceOf(ConflictError);

      const memberships = await db.manager.count(LoyaltyMembershipEntity, {
        where: { merchantId: suspended },
      });
      expect(memberships).toBe(0);
    });

    it("re-joining a closed membership reactivates it and keeps the balance", async () => {
      const view = await readyMerchantContext(MEMBER_ID, merchantA);
      const before = view.membership.balance;
      await db.query(
        `UPDATE loyalty_membership SET status = 'closed' WHERE id = $1`,
        [view.membership.id],
      );

      const rejoined = await enrollBySlug({ userId: MEMBER_ID, slug: SLUG_A });
      expect(rejoined.createdMembership).toBe(false);
      expect(rejoined.balance).toBe(before);

      const after = await readyMerchantContext(MEMBER_ID, merchantA);
      expect(after.membership.status).toBe("active");
      expect(after.membership.balance).toBe(before);
      expect(after.membership.id).toBe(view.membership.id);
    });
  },
);
