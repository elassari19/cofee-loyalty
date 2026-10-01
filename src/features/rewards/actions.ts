"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { guardedAction, type ActionResult } from "@/auth/action-guard";
import { requireTenant } from "@/auth/tenant";
import {
  loadOnboardingState,
  resolveOnboardingTarget,
} from "@/features/merchants/onboarding";
import { runInTransaction } from "@/db/transactions";
import { recordAudit } from "@/lib/audit";
import { clientIp } from "@/lib/request-ip";

import { createReward, setRewardActive, updateReward } from "./service";
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
    revalidatePath("/me/rewards");
    revalidatePath("/register/rewards");
  }
  return result;
}

/**
 * Edits an existing reward (checklist §9 bullet 1). The tenant comes from the
 * session — a reward id from another merchant is a 404 inside the service, so
 * a crafted payload cannot reach it.
 */
export async function updateRewardAction(
  rewardId: string,
  values: RewardFormValues,
): Promise<ActionResult<{ rewardId: string }>> {
  const requestHeaders = await headers();

  const result = await guardedAction("rewards.write", async (auth) => {
    const merchantId = requireTenant(auth);
    const reward = await runInTransaction((em) =>
      updateReward(em, { merchantId, rewardId, values }),
    );

    await recordAudit({
      action: "loyalty.reward_updated",
      resource: "reward",
      resourceId: reward.id,
      merchantId,
      actorId: auth.userId,
      actorRole: auth.role,
      ipAddress: clientIp(requestHeaders),
      metadata: {
        name: reward.name,
        cost: reward.cost,
        unit: reward.unit,
        redemptionLimit: reward.redemptionLimit,
        redemptionCount: reward.redemptionCount,
        expiresAt: reward.expiresAt ? reward.expiresAt.toISOString() : null,
      },
    });
    return { rewardId: reward.id };
  });

  if (result.ok) {
    revalidatePath("/rewards");
    revalidatePath("/me/rewards");
    revalidatePath("/register/rewards");
    revalidatePath("/onboarding", "layout");
  }
  return result;
}

/**
 * Activates or pauses a reward (checklist §9 bullet 1). Pausing is reversible
 * and stops new codes only, so the confirmation the UI asks for is about
 * clarity, not irreversibility — the audit row records which way it moved.
 */
export async function setRewardActiveAction(
  rewardId: string,
  active: boolean,
): Promise<ActionResult<{ rewardId: string; status: string; name: string }>> {
  const requestHeaders = await headers();

  const result = await guardedAction("rewards.write", async (auth) => {
    const merchantId = requireTenant(auth);
    const reward = await runInTransaction((em) =>
      setRewardActive(em, { merchantId, rewardId, active }),
    );

    await recordAudit({
      action: active
        ? "loyalty.reward_activated"
        : "loyalty.reward_deactivated",
      resource: "reward",
      resourceId: reward.id,
      merchantId,
      actorId: auth.userId,
      actorRole: auth.role,
      ipAddress: clientIp(requestHeaders),
      metadata: { name: reward.name, status: reward.status },
    });
    return { rewardId: reward.id, status: reward.status, name: reward.name };
  });

  if (result.ok) {
    revalidatePath("/rewards");
    revalidatePath("/me/rewards");
    revalidatePath("/register/rewards");
    revalidatePath("/onboarding", "layout");
  }
  return result;
}
