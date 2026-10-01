"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { guardedAction, type ActionResult } from "@/auth/action-guard";
import {
  loadOnboardingState,
  resolveOnboardingTarget,
} from "@/features/merchants/onboarding";
import { runInTransaction } from "@/db/transactions";
import { recordAudit } from "@/lib/audit";
import { clientIp } from "@/lib/request-ip";

import { createReward } from "./service";
import type { RewardFormValues } from "./schemas";

/**
 * Reward server action for onboarding (checklist §6 bullet 6).
 *
 * The reward's `unit` is never taken from the client — the service derives it
 * from the merchant's program row inside the same transaction.
 */
export async function createRewardAction(values: RewardFormValues): Promise<
  ActionResult<{
    rewardId: string;
    cost: number;
    unit: string;
    nextPath: string;
  }>
> {
  const requestHeaders = await headers();

  const result = await guardedAction("rewards.write", async (auth) => {
    const merchant = await resolveOnboardingTarget(auth);
    if (!merchant) {
      throw new Error("No business to add a reward to — register one first.");
    }
    const reward = await runInTransaction((em) =>
      createReward(em, { merchantId: merchant.id, values }),
    );

    await recordAudit({
      action: "loyalty.reward_created",
      resource: "reward",
      resourceId: reward.id,
      merchantId: reward.merchantId,
      actorId: auth.userId,
      actorRole: auth.role,
      ipAddress: clientIp(requestHeaders),
      metadata: { name: reward.name, cost: reward.cost, unit: reward.unit },
    });
    const state = await loadOnboardingState(merchant);
    return {
      rewardId: reward.id,
      cost: reward.cost,
      unit: reward.unit,
      nextPath: state.nextStep?.href ?? "/onboarding/launch",
    };
  });

  if (result.ok) {
    revalidatePath("/onboarding", "layout");
    revalidatePath("/rewards");
  }
  return result;
}
