"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import type { ActionResult } from "./action-guard";
import { applySetCookie, decodeStoredValue } from "./cookies";
import {
  homePathFor,
  resolveAuthFromCookieSource,
  type AuthContext,
} from "./context";
import {
  ACTIVE_MERCHANT_COOKIE,
  performRequestPasswordReset,
  performResetPassword,
  performResendVerification,
  performSetActiveMerchant,
  performSignIn,
  performSignUp,
  performSignOut,
  safeNextPath,
} from "./flows";

/**
 * Authentication server actions (checklist §5).
 *
 * The `"use server"` boundary: every export is an async function returning an
 * `ActionResult` or redirecting. All of the logic lives in `./flows`, which
 * pages can call too — this file only adds cookie access and navigation.
 *
 * Redirects are issued *outside* any try/catch so Next's own redirect
 * mechanism is never swallowed, and failures are returned as data so a form
 * can show the exact message.
 */

interface FlowContext {
  headers: Headers;
  readCookie: (name: string) => string | undefined;
  setCookie: (entry: string) => void;
}

async function flowContext(): Promise<FlowContext> {
  const requestHeaders = await headers();
  const store = await cookies();
  return {
    headers: requestHeaders,
    readCookie: (name: string) => store.get(name)?.value,
    // A server action has no response object to attach `set-cookie` to, so
    // the session cookies Better Auth issues are written into the store here.
    setCookie: (entry: string) =>
      applySetCookie(entry, (name, value, options) =>
        store.set(name, decodeStoredValue(value), options),
      ),
  };
}

export async function signInAction(values: {
  email: string;
  password: string;
  next?: string;
}): Promise<ActionResult<{ redirectTo: string }>> {
  const context = await flowContext();
  const result = await performSignIn({
    email: values.email,
    password: values.password,
    headers: context.headers,
    readCookie: context.readCookie,
    setCookie: context.setCookie,
  });
  if (!result.ok) return result;
  redirect(safeNextPath(values.next) ?? result.data.redirectTo);
}

export async function signUpAction(values: {
  name: string;
  email: string;
  password: string;
  next?: string;
}): Promise<ActionResult<{ redirectTo: string }>> {
  const context = await flowContext();
  const result = await performSignUp({
    name: values.name,
    email: values.email,
    password: values.password,
    headers: context.headers,
    readCookie: context.readCookie,
    setCookie: context.setCookie,
  });
  if (!result.ok) return result;
  redirect(safeNextPath(values.next) ?? result.data.redirectTo);
}

export async function signOutAction(): Promise<ActionResult<never>> {
  const context = await flowContext();
  const result = await performSignOut(context);
  const store = await cookies();
  store.delete(ACTIVE_MERCHANT_COOKIE);
  if (!result.ok) return result;
  redirect("/sign-in");
}

export async function requestPasswordResetAction(values: {
  email: string;
}): Promise<ActionResult<{ message: string }>> {
  const context = await flowContext();
  return performRequestPasswordReset({
    email: values.email,
    headers: context.headers,
    readCookie: context.readCookie,
  });
}

export async function resetPasswordAction(values: {
  token: string;
  newPassword: string;
}): Promise<ActionResult<{ redirectTo: string }>> {
  const context = await flowContext();
  const result = await performResetPassword({
    token: values.token,
    newPassword: values.newPassword,
    headers: context.headers,
    readCookie: context.readCookie,
  });
  if (!result.ok) return result;
  redirect(result.data.redirectTo);
}

export async function resendVerificationAction(values: {
  email: string;
}): Promise<ActionResult<{ message: string }>> {
  const context = await flowContext();
  return performResendVerification({
    email: values.email,
    headers: context.headers,
    readCookie: context.readCookie,
  });
}

/**
 * Records the active tenant for this session. The id is validated against the
 * memberships of the *session's* user before it is written, so the cookie can
 * only ever re-state what the server already knows.
 */
export async function setActiveMerchantAction(values: {
  merchantId: string;
}): Promise<ActionResult<{ merchantId: string }>> {
  const requestHeaders = await headers();
  const store = await cookies();
  const auth: AuthContext | null = await resolveAuthFromCookieSource(
    store,
    requestHeaders,
  );
  if (!auth) {
    return {
      ok: false,
      code: "unauthorized",
      message: "Your session has ended. Sign in and try again.",
    };
  }

  const result = await performSetActiveMerchant({
    auth,
    merchantId: values.merchantId,
    headers: requestHeaders,
    readCookie: (name) => store.get(name)?.value,
    // The flow decides whether the choice is allowed; this only persists it.
    setCookie: (entry) =>
      applySetCookie(entry, (name, value, options) =>
        store.set(name, decodeStoredValue(value), options),
      ),
  });
  if (!result.ok) return result;

  redirect(homePathFor(auth));
}
