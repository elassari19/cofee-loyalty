"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { guardedAction, type ActionResult } from "@/auth/action-guard";
import { requireTenant } from "@/auth/tenant";
import {
  loadOnboardingState,
  resolveOnboardingTarget,
} from "@/features/merchants/onboarding";
import { activateMerchantForLaunch } from "@/features/merchants/service";
import { getDb } from "@/db/connection";
import { runInTransaction } from "@/db/transactions";
import { recordAudit } from "@/lib/audit";
import { dispatchOutboxSafely } from "@/lib/domain-events";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

import { activateLoyaltyProgram, saveProgramForMerchant } from "./service";
import {
  adjustBalance,
  listMemberOptions,
  listTenantTransactions,
  lookupMemberByCard,
  previewPurchase,
  recordPurchase,
  type AdjustmentOutcome,
  type MemberLookup,
  type MemberOption,
  type PurchaseOutcome,
  type PurchasePreview,
  type TenantTransactionRow,
  type TransactionGroup,
} from "./transactions";
import type { AdjustmentValues, ProgramFormValues } from "./schemas";

/**
 * Loyalty program server actions (checklist §6 bullets 2–5) and staff
 * transaction actions (checklist §8).
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

// ---------------------------------------------------------------------------
// Staff transactions (checklist §8 bullets 4–7)
// ---------------------------------------------------------------------------

/**
 * Finds a member from a scanned card / identity token.
 *
 * Returns `null` rather than throwing so the register can render an inline
 * "no member matched" hint instead of toast-spamming a cashier who mistypes a
 * card. The resolve endpoint is rate limited per IP + tenant; the token itself
 * is never echoed back (the service returns a bounded, field-limited profile).
 */
export async function lookupMemberAction(
  payload: string,
): Promise<ActionResult<MemberLookup | null>> {
  const requestHeaders = await headers();

  return guardedAction("transactions.create", async (auth) => {
    await enforceRateLimit(
      "tokenResolve",
      `${clientIp(requestHeaders)}|${auth.merchantId ?? "none"}`,
    );
    return lookupMemberByCard(auth, payload);
  });
}

/**
 * Read-only dry run: same context checks and same engine as the write, so the
 * confirm screen cannot disagree with what will actually be recorded.
 */
export async function previewPurchaseAction(values: {
  membershipId: string;
  amount: unknown;
  currency?: unknown;
}): Promise<ActionResult<PurchasePreview>> {
  return guardedAction("transactions.create", async (auth) => {
    const em = (await getDb()).manager;
    return previewPurchase(em, auth, values);
  });
}

/**
 * Records the confirmed purchase. The idempotency key is minted by the client
 * when the review step opens, so a double-submit, a lost response, or an
 * offline retry resolves to the original entry instead of a second award.
 *
 * Audit + outbox dispatch both happen *after* the ledger commit: a rolled-back
 * write must leave no audit row and no publishable event.
 */
export async function submitPurchaseAction(values: {
  membershipId: string;
  amount: unknown;
  currency?: unknown;
  idempotencyKey: string;
  externalRef?: string;
}): Promise<ActionResult<PurchaseOutcome>> {
  const requestHeaders = await headers();

  const result = await guardedAction("transactions.create", async (auth) => {
    const merchantId = requireTenant(auth);
    const outcome = await runInTransaction((em) =>
      recordPurchase(em, auth, values),
    );

    if (!outcome.replayed) {
      await recordAudit({
        action: "loyalty.earned",
        resource: "loyalty_transaction",
        resourceId: outcome.entry.id,
        merchantId,
        actorId: auth.userId,
        actorRole: auth.role,
        ipAddress: clientIp(requestHeaders),
        metadata: {
          entryType: outcome.entry.type,
          membershipId: outcome.entry.membershipId,
          delta: outcome.delta,
          unit: outcome.unit,
          amount: outcome.amount,
          currency: outcome.currency,
          source: "register",
        },
      });
      await dispatchOutboxSafely();
    }
    return outcome;
  });

  if (result.ok) {
    revalidatePath("/register");
    revalidatePath("/register/transactions");
    revalidatePath("/transactions");
  }
  return result;
}

/**
 * Manual balance adjustment — owner/manager only (`transactions.adjust`,
 * enforced by the capability guard here *and* by `adjustBalance` itself).
 * The reason is mandatory in the schema, recorded on the ledger entry, and
 * written to the audit trail alongside the delta. `idempotencyKey` is minted
 * when the dialog opens so a double-click posts the same adjustment once.
 */
export async function adjustBalanceAction(
  values: AdjustmentValues & { idempotencyKey: string },
): Promise<ActionResult<AdjustmentOutcome>> {
  const requestHeaders = await headers();

  const result = await guardedAction("transactions.adjust", async (auth) => {
    const merchantId = requireTenant(auth);
    const outcome = await runInTransaction((em) =>
      adjustBalance(em, auth, values),
    );

    if (!outcome.replayed) {
      await recordAudit({
        action: "loyalty.adjusted",
        resource: "loyalty_transaction",
        resourceId: outcome.entry.id,
        merchantId,
        actorId: auth.userId,
        actorRole: auth.role,
        ipAddress: clientIp(requestHeaders),
        metadata: {
          entryType: outcome.entry.type,
          membershipId: outcome.entry.membershipId,
          delta: outcome.delta,
          unit: outcome.unit,
          reason: outcome.entry.reason,
          source: "manual",
        },
      });
      await dispatchOutboxSafely();
    }
    return outcome;
  });

  if (result.ok) {
    revalidatePath("/register");
    revalidatePath("/register/transactions");
    revalidatePath("/transactions");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Histories (checklist §8 bullets 5 and 8)
// ---------------------------------------------------------------------------

/** Tenant-wide register/history list — member and purchase fields only. */
export async function listTransactionsAction(
  options: { group?: TransactionGroup; limit?: number } = {},
): Promise<ActionResult<{ rows: TenantTransactionRow[] }>> {
  return guardedAction("transactions.read", async (auth) => ({
    rows: await listTenantTransactions(auth, options),
  }));
}

/** Member picker for the register/adjustment forms (never raw SQL there). */
export async function listMemberPickerAction(): Promise<
  ActionResult<{ options: MemberOption[] }>
> {
  return guardedAction("transactions.create", async (auth) => ({
    options: await listMemberOptions(auth),
  }));
}
