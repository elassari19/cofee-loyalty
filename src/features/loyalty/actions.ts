"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { guardedAction, type ActionResult } from "@/auth/action-guard";
import {
  loadOnboardingState,
  resolveOnboardingTarget,
} from "@/features/merchants/onboarding";
import { activateMerchantForLaunch } from "@/features/merchants/service";
import { runInTransaction } from "@/db/transactions";
import { recordAudit } from "@/lib/audit";
import { clientIp } from "@/lib/request-ip";

import { activateLoyaltyProgram, saveProgramForMerchant } from "./service";
import type { ProgramFormValues } from "./schemas";

/**
 * Loyalty program server actions (checklist §6 bullets 2–5).
 *
 * Two separate operations on purpose: *saving rules* keeps the program a
 * draft (repeatable, resumable), while *activating* is the owner-only launch
 * gate that also flips the merchant out of `trial` — both composed with the
 * merchants feature inside one transaction, both audited only after commit.
 */

/** Saves the selected model + rules for the onboarding target (draft). */
export async function saveProgramAction(
  values: ProgramFormValues,
): Promise<
  ActionResult<{ programId: string; ruleVersion: number; nextPath: string }>
> {
  const requestHeaders = await headers();

  const result = await guardedAction("loyalty.write", async (auth) => {
    const merchant = await resolveOnboardingTarget(auth);
    if (!merchant) {
      throw new Error("No business to configure — register one first.");
    }
    const program = await runInTransaction((em) =>
      saveProgramForMerchant(em, { merchantId: merchant.id, values }),
    );

    await recordAudit({
      action: "loyalty.program_updated",
      resource: "loyalty_program",
      resourceId: program.id,
      merchantId: program.merchantId,
      actorId: auth.userId,
      actorRole: auth.role,
      ipAddress: clientIp(requestHeaders),
      metadata: {
        event: "rules_saved",
        type: program.type,
        ruleVersion: program.ruleVersion,
        status: program.status,
      },
    });
    const state = await loadOnboardingState(merchant);
    return {
      programId: program.id,
      ruleVersion: program.ruleVersion,
      nextPath: state.nextStep?.href ?? "/onboarding/launch",
    };
  });

  if (result.ok) {
    revalidatePath("/onboarding", "layout");
    revalidatePath("/loyalty");
  }
  return result;
}

/**
 * Activates the program and the merchant in one transaction — the owner-only
 * "go live" gate (needs both `loyalty.write` and `merchant.write`, so a
 * manager can tune rules but never launch).
 */
export async function activateProgramAction(): Promise<
  ActionResult<{ programId: string; merchantId: string }>
> {
  const requestHeaders = await headers();

  const result = await guardedAction(
    ["merchant.write", "loyalty.write"],
    async (auth) => {
      const merchant = await resolveOnboardingTarget(auth);
      if (!merchant) {
        throw new Error("No business to activate — register one first.");
      }
      const activated = await runInTransaction(async (em) => {
        const program = await activateLoyaltyProgram(em, merchant.id);
        const updated = await activateMerchantForLaunch(em, merchant.id);
        return { program, merchant: updated };
      });

      await recordAudit({
        action: "loyalty.program_updated",
        resource: "loyalty_program",
        resourceId: activated.program.id,
        merchantId: merchant.id,
        actorId: auth.userId,
        actorRole: auth.role,
        ipAddress: clientIp(requestHeaders),
        metadata: {
          event: "activated",
          type: activated.program.type,
          ruleVersion: activated.program.ruleVersion,
        },
      });
      await recordAudit({
        action: "merchant.activated",
        resource: "merchant",
        resourceId: merchant.id,
        merchantId: merchant.id,
        actorId: auth.userId,
        actorRole: auth.role,
        ipAddress: clientIp(requestHeaders),
        metadata: { from: merchant.status, to: "active" },
      });
      return { programId: activated.program.id, merchantId: merchant.id };
    },
  );

  if (result.ok) {
    revalidatePath("/onboarding", "layout");
    revalidatePath("/loyalty");
    revalidatePath("/dashboard");
  }
  return result;
}
