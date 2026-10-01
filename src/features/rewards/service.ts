import type { EntityManager } from "typeorm";

import { LoyaltyProgramEntity } from "@/db/entities/loyalty-program.entity";
import { RewardEntity, type Reward } from "@/db/entities/reward.entity";
import { ConflictError } from "@/lib/errors";
import { parseInput } from "@/lib/schemas";

import { rewardFormSchema, type RewardFormValues } from "./schemas";

/**
 * Reward creation for onboarding (checklist §6 bullet 6, PRD §18).
 *
 * `unit` is derived from the merchant's program **on the server** — it is
 * never part of the payload — so a crafted request cannot price a points
 * reward in stamps (or attach a reward before any program exists).
 */

export interface CreateRewardInput {
  merchantId: string;
  values: RewardFormValues;
}

export async function createReward(
  em: EntityManager,
  input: CreateRewardInput,
): Promise<Reward> {
  const values = parseInput(rewardFormSchema, input.values);

  const program = await em.findOne(LoyaltyProgramEntity, {
    where: { merchantId: input.merchantId },
    order: { createdAt: "DESC" },
  });
  if (!program) {
    throw new ConflictError(
      "Save the loyalty program rules first — a reward's unit comes from the program.",
    );
  }

  const reward = em.create(RewardEntity, {
    merchantId: input.merchantId,
    name: values.name,
    description: values.description || null,
    terms: values.terms || null,
    imageUrl: null,
    cost: values.cost,
    unit: program.type,
    status: "active",
    expiresAt: values.expiresAt
      ? new Date(`${values.expiresAt}T23:59:59.999Z`)
      : null,
    redemptionLimit: values.redemptionLimit,
    redemptionCount: 0,
  });
  return em.save(RewardEntity, reward);
}

/** Read helper for the onboarding reward step (skips validation). */
export async function countRewards(
  em: EntityManager,
  merchantId: string,
): Promise<number> {
  return em.count(RewardEntity, { where: { merchantId } });
}

/** The merchant's rewards, newest first — used by the reward step and hub. */
export async function listRewards(
  em: EntityManager,
  merchantId: string,
): Promise<Reward[]> {
  return em.find(RewardEntity, {
    where: { merchantId },
    order: { createdAt: "DESC" },
  });
}
