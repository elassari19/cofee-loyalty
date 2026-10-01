import type { EntityManager } from "typeorm";

import type { AuthContext } from "@/auth/context";
import { requireCapability } from "@/auth/guard";
import { requireTenant } from "@/auth/tenant";
import { getDb } from "@/db/connection";
import { LoyaltyProgramEntity } from "@/db/entities/loyalty-program.entity";
import { RewardEntity, type Reward } from "@/db/entities/reward.entity";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
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

/** Tenant-scoped catalogue read for the rewards page (checklist §9 bullet 1). */
export async function listTenantRewards(auth: AuthContext): Promise<Reward[]> {
  requireCapability(auth, "rewards.read");
  const merchantId = requireTenant(auth);
  const db = await getDb();
  return listRewards(db.manager, merchantId);
}

export interface UpdateRewardInput {
  merchantId: string;
  rewardId: string;
  values: RewardFormValues;
}

/**
 * Edits a reward in place, tenant-scoped (checklist §9 bullet 2).
 *
 * Two fields get extra care:
 *
 * - **`unit` is never accepted.** It stays whatever the merchant's program
 *   priced the reward in, so an edit can never turn a points reward into a
 *   stamps one underneath the redemptions already recorded against it.
 * - **The limit may not fall below the count.** Lowering a limit under
 *   redemptions that already happened would make `redemption_count` violate
 *   its own CHECK constraint — and would tell the merchant that redemptions
 *   exist that they do not.
 */
export async function updateReward(
  em: EntityManager,
  input: UpdateRewardInput,
): Promise<Reward> {
  const values = parseInput(rewardFormSchema, input.values);
  const reward = await em.findOne(RewardEntity, {
    where: { id: input.rewardId, merchantId: input.merchantId },
  });
  if (!reward) throw new NotFoundError("That reward could not be found.");

  if (
    values.redemptionLimit !== null &&
    values.redemptionLimit < reward.redemptionCount
  ) {
    throw new ValidationError(
      [
        {
          path: "redemptionLimit",
          message: `The limit can't be lower than the ${reward.redemptionCount} redemptions already issued.`,
        },
      ],
      `The limit can't be lower than the ${reward.redemptionCount} redemptions already issued.`,
    );
  }

  reward.name = values.name;
  reward.description = values.description || null;
  reward.terms = values.terms || null;
  reward.cost = values.cost;
  reward.expiresAt = values.expiresAt
    ? new Date(`${values.expiresAt}T23:59:59.999Z`)
    : null;
  reward.redemptionLimit = values.redemptionLimit;
  return em.save(RewardEntity, reward);
}

export interface SetRewardActiveInput {
  merchantId: string;
  rewardId: string;
  active: boolean;
}

/**
 * Pauses or resumes a reward — idempotent, and scoped to the tenant so a
 * reward id from another merchant is a 404 rather than a toggle (PRD §36).
 *
 * Pausing stops *new* codes only: reservations already made keep their value
 * and may still be completed, which is exactly what the confirmation on the
 * rewards page promises.
 */
export async function setRewardActive(
  em: EntityManager,
  input: SetRewardActiveInput,
): Promise<Reward> {
  const reward = await em.findOne(RewardEntity, {
    where: { id: input.rewardId, merchantId: input.merchantId },
  });
  if (!reward) throw new NotFoundError("That reward could not be found.");

  const status = input.active ? "active" : "inactive";
  if (reward.status === status) return reward;
  reward.status = status;
  return em.save(RewardEntity, reward);
}
