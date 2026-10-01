import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthContext } from "@/auth/context";
import { closeDb, getDb } from "@/db/connection";
import { MerchantMembershipEntity } from "@/db/entities/merchant-membership.entity";
import { MerchantEntity } from "@/db/entities/merchant.entity";
import { UserEntity } from "@/db/entities/user.entity";
import { runInTransaction } from "@/db/transactions";
import { ConflictError, NotFoundError } from "@/lib/errors";
import {
  emptyProgramFormValues,
  type ProgramFormValues,
} from "@/features/loyalty/schemas";
import {
  activateLoyaltyProgram,
  saveProgramForMerchant,
} from "@/features/loyalty/service";
import {
  loadOnboardingState,
  prerequisitesMet,
  resolveOnboardingTarget,
} from "@/features/merchants/onboarding";
import {
  businessProfileValues,
  emptyBusinessProfileValues,
  type BusinessProfileValues,
} from "@/features/merchants/schemas";
import {
  activateMerchantForLaunch,
  createBusiness,
  updateBusinessProfile,
  type CreateBusinessResult,
} from "@/features/merchants/service";
import {
  emptyRewardFormValues,
  type RewardFormValues,
} from "@/features/rewards/schemas";
import { createReward } from "@/features/rewards/service";

import { isPostgresReachable } from "../helpers/services";

const postgresReachable = await isPostgresReachable();
if (!postgresReachable) {
  console.warn(
    "[test] PostgreSQL is not reachable — skipping the onboarding suite. Run `pnpm services:up` to start it.",
  );
}

const OWNER_ID = "test_onboarding_owner";
const SLUG_BASE = "onboarding-test-cafe";

function profile(
  overrides: Partial<BusinessProfileValues> = {},
): BusinessProfileValues {
  return {
    ...emptyBusinessProfileValues(),
    name: "Onboarding Test Café",
    email: "owner@onboarding.test",
    address: "1 Wizard Street",
    ...overrides,
  };
}

function pointsValues(
  overrides: Record<string, unknown> = {},
): ProgramFormValues {
  return {
    ...emptyProgramFormValues("POINTS"),
    name: "Wizard Points",
    redemptionThresholds: [{ cost: 100, label: "Free coffee" }],
    ...overrides,
  } as ProgramFormValues;
}

function rewardValues(
  overrides: Record<string, unknown> = {},
): RewardFormValues {
  return {
    ...emptyRewardFormValues(),
    name: "Free coffee",
    ...overrides,
  } as RewardFormValues;
}

function auth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: OWNER_ID,
    role: "CUSTOMER",
    displayName: "Wizard",
    merchantId: null,
    preview: false,
    ...overrides,
  };
}

describe.skipIf(!postgresReachable)(
  "Merchant onboarding services (checklist §6)",
  () => {
    let db: DataSource;
    let first: CreateBusinessResult;
    let second: CreateBusinessResult;

    async function purge(): Promise<void> {
      const prefix = `${SLUG_BASE}%`;
      await db.query(
        `DELETE FROM reward WHERE merchant_id IN (SELECT id FROM merchant WHERE slug LIKE $1)`,
        [prefix],
      );
      await db.query(
        `DELETE FROM loyalty_program WHERE merchant_id IN (SELECT id FROM merchant WHERE slug LIKE $1)`,
        [prefix],
      );
      await db.query(
        `DELETE FROM merchant_membership WHERE merchant_id IN (SELECT id FROM merchant WHERE slug LIKE $1) OR user_id = $2`,
        [prefix, OWNER_ID],
      );
      await db.query(`DELETE FROM merchant WHERE slug LIKE $1`, [prefix]);
      await db.query(`DELETE FROM "user" WHERE id = $1`, [OWNER_ID]);
    }

    beforeAll(async () => {
      db = await getDb();
      await purge();
      await db.manager.insert(UserEntity, {
        id: OWNER_ID,
        name: "Onboarding Wizard",
        email: "onboarding-owner@test.invalid",
        emailVerified: true,
        image: null,
        role: "CUSTOMER",
        status: "active",
      });
    });

    afterAll(async () => {
      if (db) await purge();
      await closeDb();
    });

    it("creates the business, its owner membership and promotes the customer", async () => {
      first = await createBusiness({ auth: auth(), values: profile() });
      expect(first.promotedUser).toBe(true);
      expect(first.slug).toBe(SLUG_BASE);

      const merchant = await db.manager.findOneBy(MerchantEntity, {
        id: first.merchantId,
      });
      expect(merchant?.status).toBe("trial");
      expect(businessProfileValues(merchant!).email).toBe(
        "owner@onboarding.test",
      );

      const membership = await db.manager.findOneBy(MerchantMembershipEntity, {
        merchantId: first.merchantId,
        userId: OWNER_ID,
      });
      expect(membership?.role).toBe("MERCHANT_OWNER");

      const user = await db.manager.findOneBy(UserEntity, { id: OWNER_ID });
      expect(user?.role).toBe("MERCHANT");
    });

    it("keeps join slugs unique", async () => {
      second = await createBusiness({
        auth: auth({ role: "MERCHANT_OWNER" }),
        values: profile(),
      });
      expect(second.promotedUser).toBe(false);
      expect(second.slug).toBe(`${SLUG_BASE}-2`);
      expect(second.merchantId).not.toBe(first.merchantId);
    });

    it("resolves the working business from the cookie, and never in preview", async () => {
      const matched = await resolveOnboardingTarget(
        auth({ role: "MERCHANT_OWNER", merchantId: first.merchantId }),
      );
      expect(matched?.id).toBe(first.merchantId);

      const preview = await resolveOnboardingTarget({
        userId: "preview:MERCHANT_OWNER",
        role: "MERCHANT_OWNER",
        displayName: "Preview",
        merchantId: null,
        preview: true,
      });
      expect(preview).toBeNull();
    });

    it("updates the profile in place, keeping slug and status untouched", async () => {
      const current = await db.manager.findOneBy(MerchantEntity, {
        id: first.merchantId,
      });
      const result = await runInTransaction((em) =>
        updateBusinessProfile(em, {
          merchantId: first.merchantId,
          values: profile({
            ...businessProfileValues(current!),
            name: "Renamed Café",
          }),
        }),
      );
      expect(result.changedFields).toEqual(["name"]);
      expect(result.merchant.name).toBe("Renamed Café");
      expect(result.merchant.slug).toBe(first.slug);
      expect(result.merchant.status).toBe("trial");
    });

    it("blocks later steps while the business profile is incomplete", async () => {
      const gap = await createBusiness({
        auth: auth({ role: "MERCHANT_OWNER" }),
        values: profile({ name: "Gap Business" }),
      });
      // Blank a required field behind the service's back — exactly the state a
      // half-filled registration leaves behind.
      await db.query(`UPDATE merchant SET email = '' WHERE id = $1`, [
        gap.merchantId,
      ]);
      const merchant = await db.manager.findOneBy(MerchantEntity, {
        id: gap.merchantId,
      });

      const state = await loadOnboardingState(merchant!);
      expect(state.steps.find((step) => step.id === "business")?.complete).toBe(
        false,
      );
      expect(state.nextStep?.id).toBe("business");
      expect(prerequisitesMet(state, "program")).toBe(false);
      expect(prerequisitesMet(state, "reward")).toBe(false);
      expect(prerequisitesMet(state, "launch")).toBe(false);

      await db.query(`DELETE FROM merchant_membership WHERE merchant_id = $1`, [
        gap.merchantId,
      ]);
      await db.query(`DELETE FROM merchant WHERE id = $1`, [gap.merchantId]);
    });

    it("saves the program as a draft whose version moves only when rules change", async () => {
      const created = await runInTransaction((em) =>
        saveProgramForMerchant(em, {
          merchantId: first.merchantId,
          values: pointsValues(),
        }),
      );
      expect(created.status).toBe("draft");
      expect(created.ruleVersion).toBe(1);
      expect(created.type).toBe("POINTS");
      expect(Object.keys(created.configuration as object).sort()).toEqual([
        "expiryMonths",
        "minimumPurchase",
        "pointsPerEuro",
        "redemptionThresholds",
        "rounding",
      ]);

      const savedAgain = await runInTransaction((em) =>
        saveProgramForMerchant(em, {
          merchantId: first.merchantId,
          values: pointsValues(),
        }),
      );
      expect(savedAgain.id).toBe(created.id);
      expect(savedAgain.ruleVersion).toBe(1);

      const changed = await runInTransaction((em) =>
        saveProgramForMerchant(em, {
          merchantId: first.merchantId,
          values: pointsValues({ pointsPerEuro: 2 }),
        }),
      );
      expect(changed.ruleVersion).toBe(2);
    });

    it("prices the reward in the program's unit and refuses rewards without a program", async () => {
      const reward = await runInTransaction((em) =>
        createReward(em, {
          merchantId: first.merchantId,
          values: rewardValues(),
        }),
      );
      expect(reward.unit).toBe("POINTS");
      expect(reward.redemptionCount).toBe(0);
      expect(reward.expiresAt).toBeNull();

      await expect(
        runInTransaction((em) =>
          createReward(em, {
            merchantId: second.merchantId,
            values: rewardValues(),
          }),
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("locks the loyalty model once rewards are priced in its unit", async () => {
      await expect(
        runInTransaction((em) =>
          saveProgramForMerchant(em, {
            merchantId: first.merchantId,
            values: {
              ...emptyProgramFormValues("STAMPS"),
              name: "Wizard Card",
            } as ProgramFormValues,
          }),
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("activates program and merchant together, refusing unreadable setups", async () => {
      await expect(
        runInTransaction((em) => activateLoyaltyProgram(em, second.merchantId)),
      ).rejects.toBeInstanceOf(NotFoundError);

      const program = await runInTransaction((em) =>
        activateLoyaltyProgram(em, first.merchantId),
      );
      expect(program.status).toBe("active");

      const merchant = await runInTransaction((em) =>
        activateMerchantForLaunch(em, first.merchantId),
      );
      expect(merchant.status).toBe("active");

      const again = await runInTransaction((em) =>
        activateMerchantForLaunch(em, first.merchantId),
      );
      expect(again.status).toBe("active");

      const savedWhileActive = await runInTransaction((em) =>
        saveProgramForMerchant(em, {
          merchantId: first.merchantId,
          values: pointsValues({ pointsPerEuro: 3 }),
        }),
      );
      expect(savedWhileActive.status).toBe("active");
      expect(savedWhileActive.ruleVersion).toBe(3);
    });

    it("tracks wizard progress from the database alone and resumes at the first gap", async () => {
      // The first merchant is now active, so a bare resume resolves the trial one.
      const resumed = await resolveOnboardingTarget(
        auth({ role: "MERCHANT_OWNER" }),
      );
      expect(resumed?.id).toBe(second.merchantId);

      let merchant = (await db.manager.findOneBy(MerchantEntity, {
        id: second.merchantId,
      }))!;
      let state = await loadOnboardingState(merchant);
      expect(state.steps.find((step) => step.id === "business")?.complete).toBe(
        true,
      );
      expect(state.nextStep?.id).toBe("program");
      expect(prerequisitesMet(state, "program")).toBe(true);
      expect(prerequisitesMet(state, "reward")).toBe(false);

      await runInTransaction((em) =>
        saveProgramForMerchant(em, {
          merchantId: second.merchantId,
          values: {
            ...emptyProgramFormValues("STAMPS"),
            name: "Roast Card",
          } as ProgramFormValues,
        }),
      );
      state = await loadOnboardingState(merchant);
      expect(state.nextStep?.id).toBe("reward");

      const reward = await runInTransaction((em) =>
        createReward(em, {
          merchantId: second.merchantId,
          values: rewardValues({ name: "Free espresso" }),
        }),
      );
      expect(reward.unit).toBe("STAMPS");
      state = await loadOnboardingState(merchant);
      expect(state.nextStep?.id).toBe("launch");
      expect(prerequisitesMet(state, "launch")).toBe(true);
      expect(state.complete).toBe(false);

      await runInTransaction(async (em) => {
        await activateLoyaltyProgram(em, second.merchantId);
        await activateMerchantForLaunch(em, second.merchantId);
      });

      merchant = (await db.manager.findOneBy(MerchantEntity, {
        id: second.merchantId,
      }))!;
      state = await loadOnboardingState(merchant);
      expect(state.complete).toBe(true);
      expect(state.nextStep).toBeNull();
      expect(state.steps.every((step) => step.complete)).toBe(true);
      // When the flow is complete every step stays revisitable.
      expect(prerequisitesMet(state, "business")).toBe(true);
      expect(prerequisitesMet(state, "launch")).toBe(true);
    });
  },
);
