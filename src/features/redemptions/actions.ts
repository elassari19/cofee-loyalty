"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { guardedAction, type ActionResult } from "@/auth/action-guard";
import { requireTenant } from "@/auth/tenant";
import { runInTransaction } from "@/db/transactions";
import { recordAudit } from "@/lib/audit";
import { dispatchOutboxSafely } from "@/lib/domain-events";
import { ConflictError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

import {
  completeRedemption,
  issueRedemption,
  verifyRedemption,
  type CompleteOutcome,
  type IssuedRedemption,
  type RedemptionView,
} from "./service";

/**
 * Redemption server actions (checklist §9).
 *
 * Three separate operations on purpose — **issue** (customer), **verify**
 * (counter) and **complete** (counter) — because "checking a code" and
 * "spending it" must never be the same button (§9 bullet 6). Every action:
 *
 *   1. resolves the caller and capability through `guardedAction`;
 *   2. rate limits guessing of codes under the `redeemCode` policy, keyed by
 *      IP + tenant (the code itself is never part of the key or the logs);
 *   3. runs the service inside one transaction, so locks and writes commit
 *      together or not at all;
 *   4. audits and dispatches the outbox **after** the commit — a rolled-back
 *      write must leave neither an audit row nor a publishable event.
 *
 * The clear-text code appears in exactly one place: the issue response, which
 * goes straight to the customer's own screen. It is never audited, logged or
 * returned again.
 */

/** Rate-limit subject for counter operations: one bucket per IP + tenant. */
async function counterBucket(
  requestHeaders: Headers,
  merchantId: string | null | undefined,
  kind: "verify" | "complete",
): Promise<void> {
  await enforceRateLimit(
    "redeemCode",
    `${kind}|${clientIp(requestHeaders)}|${merchantId ?? "none"}`,
  );
}

/**
 * Customer: reserve value and get a code (PRD §19).
 *
 * Returns the code once; generating another one for the same reward settles
 * (refunds) the previous code, so a customer who lost a code is never stuck.
 */
export async function issueRedemptionAction(
  rewardId: string,
): Promise<ActionResult<IssuedRedemption>> {
  const requestHeaders = await headers();

  const result = await guardedAction("rewards.redeem", async (auth) => {
    await enforceRateLimit(
      "redeemCode",
      `issue|${clientIp(requestHeaders)}|${auth.userId}`,
    );
    const issued = await runInTransaction((em) =>
      issueRedemption(em, auth, { rewardId }),
    );

    await recordAudit({
      action: "redemption.issued",
      resource: "reward_redemption",
      resourceId: issued.redemptionId,
      merchantId: requireTenant(auth),
      actorId: auth.userId,
      actorRole: auth.role,
      ipAddress: clientIp(requestHeaders),
      metadata: {
        rewardId: issued.rewardId,
        membershipId: issued.membershipId,
        cost: issued.cost,
        unit: issued.unit,
        expiresAt: issued.expiresAt.toISOString(),
        replacedPreviousCode: issued.replacedPreviousCode,
        balanceAfter: issued.balance,
      },
    });
    // A superseded code refunds through the ledger, which enqueued its own
    // outbox row inside the transaction.
    await dispatchOutboxSafely();
    return issued;
  });

  if (result.ok) {
    revalidatePath("/me");
    revalidatePath("/me/rewards");
  }
  return result;
}

/**
 * Counter: look a code up and record who checked it. Never spends value and
 * never throws for a code that exists — an expired or already-redeemed code
 * comes back as a view the cashier can read.
 */
export async function verifyRedemptionAction(input: {
  code: unknown;
}): Promise<ActionResult<RedemptionView>> {
  const requestHeaders = await headers();

  const result = await guardedAction("rewards.redeem", async (auth) => {
    await counterBucket(requestHeaders, auth.merchantId, "verify");
    const view = await runInTransaction((em) =>
      verifyRedemption(em, auth, { code: input.code }),
    );

    if (view.changed === "expired") {
      await recordAudit({
        action: "redemption.cancelled",
        resource: "reward_redemption",
        resourceId: view.redemptionId,
        merchantId: requireTenant(auth),
        actorId: auth.userId,
        actorRole: auth.role,
        ipAddress: clientIp(requestHeaders),
        metadata: { reason: "expired", rewardId: view.rewardId },
      });
      await dispatchOutboxSafely();
    } else if (view.changed === "verified") {
      await recordAudit({
        action: "redemption.verified",
        resource: "reward_redemption",
        resourceId: view.redemptionId,
        merchantId: requireTenant(auth),
        actorId: auth.userId,
        actorRole: auth.role,
        ipAddress: clientIp(requestHeaders),
        metadata: { rewardId: view.rewardId, cost: view.cost },
      });
    }
    return view;
  });

  if (result.ok) revalidatePath("/register/rewards");
  return result;
}

/**
 * Counter: the single-use step. Idempotent — completing an already-completed
 * redemption reports the original outcome instead of spending twice — and it
 * refuses a code that was never verified, expired or cancelled, after the
 * commit, so an expiry settlement that happened inside the call sticks.
 */
export async function completeRedemptionAction(input: {
  redemptionId: unknown;
}): Promise<ActionResult<CompleteOutcome>> {
  const requestHeaders = await headers();

  const result = await guardedAction("rewards.redeem", async (auth) => {
    await counterBucket(requestHeaders, auth.merchantId, "complete");
    const outcome = await runInTransaction((em) =>
      completeRedemption(em, auth, { redemptionId: input.redemptionId }),
    );

    if (outcome.kind === "expired") {
      await recordAudit({
        action: "redemption.cancelled",
        resource: "reward_redemption",
        resourceId: outcome.redemptionId,
        merchantId: requireTenant(auth),
        actorId: auth.userId,
        actorRole: auth.role,
        ipAddress: clientIp(requestHeaders),
        metadata: { reason: "expired", rewardId: outcome.rewardId },
      });
      await dispatchOutboxSafely();
      throw new ConflictError(
        `“${outcome.rewardName}” was not redeemed — that code expired, and its value went back to the member.`,
      );
    }
    if (outcome.kind === "needs_verification") {
      throw new ConflictError(
        "Verify the code first, then redeem it. Verifying records who checked it.",
      );
    }
    if (outcome.kind === "cancelled") {
      throw new ConflictError(
        `“${outcome.rewardName}” was not redeemed — that code was replaced. Ask for a fresh one.`,
      );
    }

    if (!outcome.replayed) {
      await recordAudit({
        action: "redemption.completed",
        resource: "reward_redemption",
        resourceId: outcome.redemptionId,
        merchantId: requireTenant(auth),
        actorId: auth.userId,
        actorRole: auth.role,
        ipAddress: clientIp(requestHeaders),
        metadata: {
          rewardId: outcome.rewardId,
          rewardName: outcome.rewardName,
          cost: outcome.cost,
          unitName: outcome.unitName,
          balanceAfter: outcome.balance,
        },
      });
      await dispatchOutboxSafely();
    }
    return outcome;
  });

  if (result.ok) {
    revalidatePath("/register/rewards");
    revalidatePath("/register/transactions");
    revalidatePath("/transactions");
    revalidatePath("/me");
    revalidatePath("/me/rewards");
  }
  return result;
}
