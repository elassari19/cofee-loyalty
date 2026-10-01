import type { AuthContext } from "@/auth/context";
import type { LoyaltyProgram } from "@/db/entities/loyalty-program.entity";
import { LoyaltyProgramEntity } from "@/db/entities/loyalty-program.entity";
import type { Merchant } from "@/db/entities/merchant.entity";
import { MerchantEntity } from "@/db/entities/merchant.entity";
import type { Reward } from "@/db/entities/reward.entity";
import { RewardEntity } from "@/db/entities/reward.entity";
import { getDb } from "@/db/connection";
import { isConfigurationValid } from "@/features/loyalty/schemas";

import { isProfileComplete } from "./schemas";

/**
 * Onboarding progress and resume (checklist §6 bullet 8).
 *
 * Progress is *derived from the database*, never from a wizard-local state
 * variable: the merchant row, the program row and the reward count say which
 * step is done, so closing the tab, signing out, or opening the flow on
 * another device resumes at exactly the same place — and an incomplete setup
 * can't be "finished" by skipping ahead, because each step server-side
 * redirects to the first incomplete one.
 */

export const ONBOARDING_STEPS = [
  "business",
  "program",
  "reward",
  "launch",
] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  description: string;
  href: string;
  complete: boolean;
}

export interface OnboardingState {
  merchant: Merchant;
  program: LoyaltyProgram | null;
  rewards: Reward[];
  rewardCount: number;
  steps: OnboardingStep[];
  /** First incomplete step in order; `null` when setup is complete. */
  nextStep: OnboardingStep | null;
  complete: boolean;
}

export const STEP_COPY: Record<
  OnboardingStepId,
  { title: string; description: string; href: string }
> = {
  business: {
    title: "Business profile",
    description: "Name, category, contact, address, currency and timezone.",
    href: "/onboarding/business",
  },
  program: {
    title: "Loyalty model & rules",
    description: "Pick points or stamps and configure exactly one of them.",
    href: "/onboarding/program",
  },
  reward: {
    title: "First reward",
    description: "The benefit customers can redeem their value for.",
    href: "/onboarding/reward",
  },
  launch: {
    title: "Activate & join QR",
    description: "Go live and display the QR customers scan to join.",
    href: "/onboarding/launch",
  },
};

/**
 * The business this onboarding session works on.
 *
 * Resolution is entirely server-side: an explicitly chosen active tenant wins,
 * otherwise the newest trial business the identity owns (resume), otherwise
 * the newest owned business at all. Owners only — a manager or staff member
 * has no business-creation rights, and customers without a membership get
 * `null` (the registration step).
 */
export async function resolveOnboardingTarget(
  auth: AuthContext,
): Promise<Merchant | null> {
  if (auth.preview) return null;
  const db = await getDb();
  const owned = await db
    .getRepository(MerchantEntity)
    .createQueryBuilder("m")
    .innerJoin(
      "merchant_membership",
      "mm",
      "mm.merchant_id = m.id AND mm.user_id = :userId",
      { userId: auth.userId },
    )
    .where("mm.status = 'active'")
    .andWhere("mm.role = 'MERCHANT_OWNER'")
    .andWhere("m.status <> 'suspended'")
    .orderBy("CASE WHEN m.status = 'trial' THEN 0 ELSE 1 END", "ASC")
    .addOrderBy("m.created_at", "DESC")
    .limit(20)
    .getMany();
  if (owned.length === 0) return null;
  const chosen = auth.merchantId
    ? owned.find((merchant) => merchant.id === auth.merchantId)
    : undefined;
  return chosen ?? owned[0] ?? null;
}

/** Loads the full progress picture for one merchant. */
export async function loadOnboardingState(
  merchant: Merchant,
): Promise<OnboardingState> {
  const db = await getDb();
  const programs = await db.getRepository(LoyaltyProgramEntity).find({
    where: { merchantId: merchant.id },
    order: { createdAt: "DESC" },
    take: 1,
  });
  const program = programs[0] ?? null;
  const rewards = await db.getRepository(RewardEntity).find({
    where: { merchantId: merchant.id },
    order: { createdAt: "DESC" },
  });
  const rewardCount = rewards.length;

  const completeById: Record<OnboardingStepId, boolean> = {
    business: isProfileComplete(merchant),
    program: Boolean(
      program && isConfigurationValid(program.type, program.configuration),
    ),
    reward: rewardCount > 0,
    launch: merchant.status === "active" && program?.status === "active",
  };

  const steps: OnboardingStep[] = ONBOARDING_STEPS.map((id) => ({
    id,
    ...STEP_COPY[id],
    complete: completeById[id],
  }));
  const nextStep = steps.find((step) => !step.complete) ?? null;

  return {
    merchant,
    program,
    rewards,
    rewardCount,
    steps,
    nextStep,
    complete: nextStep === null,
  };
}

/**
 * Whether `target`'s prerequisites are done: later steps are unreachable
 * until the earlier ones complete; completed steps stay revisitable for edits.
 * When the whole flow is complete, every step passes (there is no pending
 * `nextStep` to redirect to).
 */
export function prerequisitesMet(
  state: OnboardingState,
  target: OnboardingStepId,
): boolean {
  const targetIndex = ONBOARDING_STEPS.indexOf(target);
  return (
    state.nextStep === null ||
    state.steps.slice(0, targetIndex).every((step) => step.complete)
  );
}
