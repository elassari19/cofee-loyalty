"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { guardedAction, type ActionResult } from "@/auth/action-guard";
import { applySetCookie, decodeStoredValue } from "@/auth/cookies";
import { activeMerchantCookieEntry } from "@/auth/flows";
import { runInTransaction } from "@/db/transactions";
import { recordAudit } from "@/lib/audit";
import { clientIp } from "@/lib/request-ip";

import { loadOnboardingState, resolveOnboardingTarget } from "./onboarding";
import { createBusiness, updateBusinessProfile } from "./service";
import type { BusinessProfileValues } from "./schemas";

/**
 * Merchant onboarding server actions (checklist §6 bullets 1 and 8).
 *
 * `guardedAction` answers *who and may they* before anything is written; the
 * target merchant is resolved from the session (never from the payload); the
 * writes run in one transaction; the audit rows are recorded only after the
 * transaction commits, so the trail never describes a change that rolled back.
 * Expected failures come back as `ActionResult` — only `redirect()` is thrown
 * (outside any catch), which Next's client helper swallows as navigation.
 */

/**
 * Creates the business + owner membership (+ platform-role promotion) in one
 * transaction, records the tenant cookie so the very next request operates in
 * it, and continues the wizard at the loyalty step.
 */
export async function createBusinessAction(
  values: BusinessProfileValues,
): Promise<ActionResult<never>> {
  const requestHeaders = await headers();

  const result = await guardedAction("merchant.create", async (auth) => {
    const created = await createBusiness({ auth, values });

    await recordAudit({
      action: "merchant.created",
      resource: "merchant",
      resourceId: created.merchantId,
      merchantId: created.merchantId,
      actorId: auth.userId,
      actorRole: auth.role,
      ipAddress: clientIp(requestHeaders),
      metadata: { name: values.name, slug: created.slug, source: "onboarding" },
    });
    if (created.promotedUser) {
      await recordAudit({
        action: "user.role_changed",
        resource: "user",
        resourceId: auth.userId,
        actorId: auth.userId,
        actorRole: auth.role,
        ipAddress: clientIp(requestHeaders),
        metadata: {
          from: "CUSTOMER",
          to: "MERCHANT",
          reason: "business_registered",
        },
      });
    }
    return created;
  });
  if (!result.ok) return result;

  // A server action has no response object, so the validated tenant choice
  // goes straight into Next's cookie store — same entry the chooser writes.
  const store = await cookies();
  applySetCookie(
    activeMerchantCookieEntry(result.data.merchantId),
    (name, value, options) =>
      store.set(name, decodeStoredValue(value), options),
  );

  revalidatePath("/onboarding", "layout");
  redirect("/onboarding/program");
}

/**
 * Saves the business profile for the onboarding target (the active tenant
 * when one is chosen, else the trial business being resumed). `slug` and
 * `status` are never part of the payload — see the service. Returns the next
 * wizard step so the client can advance in one round trip.
 */
export async function saveBusinessProfileAction(
  values: BusinessProfileValues,
): Promise<
  ActionResult<{
    merchantId: string;
    changedFields: string[];
    nextPath: string;
  }>
> {
  const requestHeaders = await headers();

  const result = await guardedAction("merchant.write", async (auth) => {
    const merchant = await resolveOnboardingTarget(auth);
    if (!merchant) {
      throw new Error("No business to update — register one first.");
    }
    const updated = await runInTransaction((em) =>
      updateBusinessProfile(em, { merchantId: merchant.id, values }),
    );

    await recordAudit({
      action: "merchant.updated",
      resource: "merchant",
      resourceId: updated.merchant.id,
      merchantId: updated.merchant.id,
      actorId: auth.userId,
      actorRole: auth.role,
      ipAddress: clientIp(requestHeaders),
      metadata: { name: updated.merchant.name, fields: updated.changedFields },
    });
    const state = await loadOnboardingState(updated.merchant);
    return {
      merchantId: updated.merchant.id,
      changedFields: updated.changedFields,
      nextPath: state.nextStep?.href ?? "/onboarding/launch",
    };
  });
  if (!result.ok) return result;

  revalidatePath("/onboarding", "layout");
  revalidatePath("/settings");
  return result;
}
