"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { guardedAction, type ActionResult } from "@/auth/action-guard";
import { applySetCookie, decodeStoredValue } from "@/auth/cookies";
import { resolveAuthFromCookieSource } from "@/auth/context";
import {
  activeMerchantCookieEntry,
  performChangePassword,
  performSignUp,
} from "@/auth/flows";
import { recordAudit } from "@/lib/audit";
import { ForbiddenError } from "@/lib/errors";
import { getLogger } from "@/lib/logger";
import { clientIp } from "@/lib/request-ip";
import { parseInput } from "@/lib/schemas";

import {
  changePasswordSchema,
  joinFormSchema,
  joinRequestSchema,
  profileFormSchema,
  type ChangePasswordValues,
  type JoinFormValues,
  type ProfileFormValues,
} from "./schemas";
import {
  enrollBySlug,
  resolveJoinTarget,
  rotateIdentityToken,
  updateCustomerProfile,
  type EnrollResult,
} from "./service";

/**
 * Customer enrollment and profile server actions (checklist §7).
 *
 * Two ways in, one outcome:
 *
 *   - `joinSignUpAction` — the anonymous visitor on `/join/<slug>`: creates
 *     the platform identity (through the rate-limited, audited sign-up flow)
 *     and enrolls it, all in one round trip. The join target is resolved
 *     *before* an account exists, so a bad or closed link never leaves a
 *     stray user behind.
 *   - `joinMerchantAction` — an already signed-in customer: enrollment only,
 *     guarded by `profile.write`, which is a capability only `CUSTOMER`
 *     holds.
 *
 * Enrollment itself is idempotent (see `service.ts`), so a double-click, a
 * repeated scan or a retried POST all land on the same membership and the
 * same card. Every write here is followed by an audit row recorded *after*
 * it commits, and the active-tenant cookie is only ever written for a
 * membership the server just resolved for this session.
 */

/** Records the membership as the session's active tenant, then revalidates. */
async function activateMembership(
  merchantId: string,
  slug: string,
): Promise<void> {
  const store = await cookies();
  applySetCookie(
    activeMerchantCookieEntry(merchantId),
    (name, value, options) =>
      store.set(name, decodeStoredValue(value), options),
  );
  revalidatePath("/me", "layout");
  revalidatePath(`/join/${encodeURIComponent(slug)}`);
}

/** Audit row for a membership that did not exist before this call. */
async function auditEnrollment(input: {
  enrolled: EnrollResult;
  userId: string;
  role: string;
  ipAddress: string | null;
  source: "join_link" | "sign_up";
}): Promise<void> {
  await recordAudit({
    action: "customer.enrolled",
    resource: "loyalty_membership",
    resourceId: input.enrolled.membershipId,
    merchantId: input.enrolled.merchantId,
    actorId: input.userId,
    actorRole: input.role,
    ipAddress: input.ipAddress,
    metadata: {
      merchant: input.enrolled.merchantName,
      source: input.source,
      newProfile: input.enrolled.createdProfile,
    },
  });
}

/**
 * One-click join for a signed-in customer (checklist §7 bullets 1–4).
 *
 * The slug comes from the page's URL; the identity comes from the session.
 * Repeat calls are no-ops that still return the membership, which is what
 * makes "scan, scan again" and a double-tap on the button harmless.
 */
export async function joinMerchantAction(values: { slug: string }): Promise<
  ActionResult<{
    merchantId: string;
    merchantName: string;
    alreadyMember: boolean;
  }>
> {
  const requestHeaders = await headers();
  const { slug } = parseInput(joinRequestSchema, values);

  const result = await guardedAction("profile.write", async (auth) => {
    if (auth.preview) {
      throw new ForbiddenError("Preview mode can't join a loyalty program.");
    }
    if (auth.role !== "CUSTOMER") {
      throw new ForbiddenError(
        "This link joins a customer loyalty program — sign in with a customer account.",
      );
    }

    const enrolled = await enrollBySlug({
      userId: auth.userId,
      slug,
      name: auth.displayName,
    });
    if (enrolled.createdMembership) {
      await auditEnrollment({
        enrolled,
        userId: auth.userId,
        role: auth.role,
        ipAddress: clientIp(requestHeaders),
        source: "join_link",
      });
    }
    return enrolled;
  });
  if (!result.ok) return result;

  await activateMembership(result.data.merchantId, slug);

  return {
    ok: true,
    data: {
      merchantId: result.data.merchantId,
      merchantName: result.data.merchantName,
      alreadyMember: !result.data.createdMembership,
    },
  };
}

/**
 * Registration from a join URL (checklist §7 bullet 1).
 *
 * Runs outside `guardedAction` on purpose: the caller is anonymous *by
 * design* here. Order of operations matters — link validated, then account
 * created (sign-up's own rate limit and audit apply), then enrollment — and
 * the only redirects happen outside every `catch`, so Next's navigation
 * control flow is never swallowed by an error handler.
 */
export async function joinSignUpAction(
  values: JoinFormValues & { slug: string },
): Promise<ActionResult<never>> {
  const parsed = parseInput(joinFormSchema, values);
  const { slug } = parseInput(joinRequestSchema, { slug: values.slug });

  const requestHeaders = await headers();
  const store = await cookies();
  const readCookie = (name: string) => store.get(name)?.value;
  const setCookie = (entry: string) =>
    applySetCookie(entry, (name, value, options) =>
      store.set(name, decodeStoredValue(value), options),
    );
  const ip = clientIp(requestHeaders);

  const existing = await resolveAuthFromCookieSource(store, requestHeaders);
  if (existing) {
    return {
      ok: false,
      code: "forbidden",
      message: "You're already signed in — use the Join button instead.",
    };
  }

  const target = await resolveJoinTarget(slug);
  if (!target) {
    return {
      ok: false,
      code: "invalid",
      message: "That join link isn't valid. Scan the code again.",
    };
  }
  if (!target.open) {
    return {
      ok: false,
      code: "invalid",
      message: `${target.merchant.name} isn't accepting new members right now.`,
    };
  }

  const signUp = await performSignUp({
    name: parsed.name,
    email: parsed.email,
    password: parsed.password,
    headers: requestHeaders,
    readCookie,
    setCookie,
  });
  if (!signUp.ok) return signUp;

  let enrolled: EnrollResult | null = null;
  try {
    enrolled = await enrollBySlug({
      userId: signUp.data.userId,
      slug,
      name: parsed.name,
      phone: parsed.phone || null,
    });
  } catch (error) {
    // The account now exists and is signed in; report the *join* failure and
    // let the page fall back to its signed-in state, where joining again is
    // one click. Nothing about the failure is surfaced beyond that.
    getLogger().error({ err: error }, "enrollment failed right after sign-up");
  }

  if (enrolled) {
    if (enrolled.createdMembership) {
      await auditEnrollment({
        enrolled,
        userId: signUp.data.userId,
        role: "CUSTOMER",
        ipAddress: ip,
        source: "sign_up",
      });
    }
    await activateMembership(enrolled.merchantId, slug);
  }

  // `redirect()` throws — it must stay outside the catch above.
  if (!enrolled) redirect(`/join/${encodeURIComponent(slug)}?joined=0`);
  if (signUp.data.verifyEmail) redirect("/verify-email?sent=1");
  redirect("/me");
}

/**
 * Replaces the member's QR card and revokes the live one (checklist §7
 * bullet 3). The new token never leaves the server here: the page is
 * re-rendered from the database, which is the only place the value should
 * ever be read from.
 */
export async function rotateIdentityTokenAction(): Promise<ActionResult<null>> {
  const requestHeaders = await headers();

  const result = await guardedAction("profile.write", async (auth) => {
    if (auth.preview) {
      throw new ForbiddenError("Preview mode has no loyalty card.");
    }
    if (!auth.merchantId) {
      throw new ForbiddenError("Pick a membership first.");
    }

    const rotated = await rotateIdentityToken({
      auth,
      merchantId: auth.merchantId,
    });
    await recordAudit({
      action: "customer.identity_rotated",
      resource: "loyalty_identity_token",
      resourceId: rotated.tokenId,
      merchantId: auth.merchantId,
      actorId: auth.userId,
      actorRole: auth.role,
      ipAddress: clientIp(requestHeaders),
      metadata: { revoked: rotated.revokedCount },
    });
    return null;
  });

  if (result.ok) revalidatePath("/me");
  return result;
}

/** Saves the customer's own contact details (checklist §7 bullet 6). */
export async function saveProfileAction(
  values: ProfileFormValues,
): Promise<ActionResult<{ name: string; changedFields: string[] }>> {
  const requestHeaders = await headers();
  const parsed = parseInput(profileFormSchema, values);

  const result = await guardedAction("profile.write", async (auth) => {
    const updated = await updateCustomerProfile({ auth, values: parsed });
    if (updated.created || updated.changedFields.length > 0) {
      await recordAudit({
        action: updated.created ? "customer.created" : "customer.updated",
        resource: "customer_profile",
        resourceId: updated.profile.id,
        merchantId: auth.merchantId,
        actorId: auth.userId,
        actorRole: auth.role,
        ipAddress: clientIp(requestHeaders),
        metadata: { fields: updated.changedFields, created: updated.created },
      });
    }
    return {
      name: updated.profile.name,
      changedFields: updated.changedFields,
    };
  });

  if (result.ok) revalidatePath("/me/profile");
  return result;
}

/**
 * Changes the signed-in customer's password and signs their other devices
 * out (checklist §7 bullet 6 — account/session security).
 */
export async function changePasswordAction(
  values: ChangePasswordValues,
): Promise<ActionResult<{ message: string }>> {
  const requestHeaders = await headers();
  const store = await cookies();
  const parsed = parseInput(changePasswordSchema, values);

  const guarded = await guardedAction("profile.write", async (auth) => {
    if (auth.preview) {
      throw new ForbiddenError("Preview mode has no password to change.");
    }
    return performChangePassword({
      userId: auth.userId,
      currentPassword: parsed.currentPassword,
      newPassword: parsed.newPassword,
      headers: requestHeaders,
      readCookie: (name) => store.get(name)?.value,
    });
  });
  if (!guarded.ok) return guarded;
  // The flow itself returns an `ActionResult`: failures inside it (wrong
  // current password, rate limit) are results too, not thrown errors.
  return guarded.data;
}
