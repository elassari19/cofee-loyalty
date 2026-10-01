"use server";

import { revalidatePath } from "next/cache";

import { guardedAction, type ActionResult } from "@/auth/action-guard";
import {
  addCampaign,
  getOwnProfile,
  updateOwnProfile,
  type Campaign,
  type OwnProfile,
} from "@/lib/demo-store";
import {
  campaignSchema,
  parseInput,
  profileSchema,
  type CampaignValues,
  type ProfileValues,
} from "@/lib/schemas";

/**
 * Server actions for the §3 demo workspace (checklist §3 bullets 5–6).
 *
 * Every action is guarded by `guardedAction` (authentication → capability
 * before any mutation) and re-validates its payload against the shared zod
 * schema, so a direct POST that skips the form's client validation still gets
 * rejected. Results are returned, not thrown, so the UI can state exactly what
 * happened — including "nothing was changed".
 *
 * Business settings, loyalty rules, purchase entry and rewards are no longer
 * here: §6 and §8 rewired the first three to the database through
 * `@/features/merchants/actions` and `@/features/loyalty/actions`, and §9
 * replaced the demo reward actions with the tenant-scoped, audited ones in
 * `@/features/rewards/actions` and `@/features/redemptions/actions`.
 */

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
