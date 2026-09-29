"use server";

import { revalidatePath } from "next/cache";

import { guardedAction, type ActionResult } from "@/auth/action-guard";
import {
  addCampaign,
  getLoyalty,
  getOwnProfile,
  recordPurchase,
  redeemReward,
  setRewardActive,
  updateBusiness,
  updateLoyalty,
  updateOwnProfile,
  type BusinessSettings,
  type Campaign,
  type LoyaltySettings,
  type OwnProfile,
  type Reward,
} from "@/lib/demo-store";
import {
  businessSettingsSchema,
  campaignSchema,
  loyaltySettingsSchema,
  parseInput,
  profileSchema,
  purchaseSchema,
  redeemSchema,
  type BusinessSettingsValues,
  type CampaignValues,
  type LoyaltySettingsValues,
  type ProfileValues,
  type PurchaseValues,
  type RedeemValues,
} from "@/lib/schemas";

/**
 * Server actions for the §3 demo workspace (checklist §3 bullets 5–6).
 *
 * Every action is guarded by `guardedAction` (authentication → capability
 * before any mutation) and re-validates its payload against the shared zod
 * schema, so a direct POST that skips the form's client validation still gets
 * rejected. Results are returned, not thrown, so the UI can state exactly what
 * happened — including "nothing was changed".
 */

export async function saveLoyaltySettings(
  values: LoyaltySettingsValues,
): Promise<ActionResult<LoyaltySettings>> {
  return guardedAction("loyalty.write", () => {
    const parsed = parseInput(loyaltySettingsSchema, values);
    updateLoyalty(parsed);
    revalidatePath("/loyalty");
    return getLoyalty();
  });
}

export async function saveBusinessSettings(
  values: BusinessSettingsValues,
): Promise<ActionResult<BusinessSettings>> {
  return guardedAction("merchant.write", () => {
    const parsed = parseInput(businessSettingsSchema, values);
    updateBusiness(parsed);
    revalidatePath("/settings");
    return parsed;
  });
}

export async function createCampaign(
  values: CampaignValues,
): Promise<ActionResult<Campaign>> {
  return guardedAction("campaigns.write", () => {
    const parsed = parseInput(campaignSchema, values);
    const campaign = addCampaign(parsed);
    revalidatePath("/campaigns");
    return campaign;
  });
}

export async function setRewardActiveAction(
  rewardId: string,
  active: boolean,
): Promise<ActionResult<Reward>> {
  return guardedAction("rewards.write", () => {
    const reward = setRewardActive(rewardId, active);
    revalidatePath("/rewards");
    return reward;
  });
}

export async function recordPurchaseAction(
  values: PurchaseValues,
): Promise<
  ActionResult<{ customerName: string; pointsEarned: number; balance: number }>
> {
  return guardedAction("transactions.create", () => {
    const parsed = parseInput(purchaseSchema, values);
    const result = recordPurchase(parsed.customerId, parsed.amount);
    revalidatePath("/register");
    revalidatePath("/register/transactions");
    return result;
  });
}

export async function redeemRewardAction(
  values: RedeemValues,
): Promise<
  ActionResult<{ customerName: string; rewardName: string; balance: number }>
> {
  return guardedAction("rewards.redeem", (auth) => {
    const parsed = parseInput(redeemSchema, values);
    // Customers may only redeem against their own membership; staff pick a
    // customer at the register. Enforced here, not in the hidden UI.
    if (auth.role === "CUSTOMER" && parsed.customerId !== "cus_maya") {
      throw new Error("You can only redeem rewards from your own account.");
    }
    const result = redeemReward(parsed.rewardId, parsed.customerId);
    revalidatePath("/rewards");
    revalidatePath("/register/rewards");
    revalidatePath("/me");
    revalidatePath("/me/rewards");
    return result;
  });
}

export async function saveOwnProfile(
  values: ProfileValues,
): Promise<ActionResult<OwnProfile>> {
  return guardedAction("profile.write", () => {
    const parsed = parseInput(profileSchema, values);
    updateOwnProfile(parsed);
    revalidatePath("/me/profile");
    return getOwnProfile();
  });
}
