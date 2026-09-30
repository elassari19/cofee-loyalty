import { getDb } from "@/db/connection";
import { recordAudit } from "@/lib/audit";
import type { ActionResult } from "@/auth/action-guard";
import { getLogger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

import { getAuth } from "./config";
import { homePathFor, type AuthContext } from "./context";
import { requireEmailVerification } from "./options";
import {
  ACTIVE_MERCHANT_COOKIE,
  contextForUser,
  listTenantCandidates,
  type SessionUser,
  type TenantCandidate,
} from "./session";

/**
 * Authentication flows (checklist §5).
 *
 * Plain server module — no `"use server"`, so it can be called both from
 * server actions (`./actions`) and from pages that verify a link during
 * render. Every flow follows the same shape:
 *
 *   1. rate limit the caller (per client address, Redis with a safe fallback);
 *   2. do the work through Better Auth (never hand-rolled credentials);
 *   3. record the outcome in the audit trail;
 *   4. return an `ActionResult` — no thrown errors for expected failures, and
 *      no message that would tell a stranger whether an account exists.
 */

export interface FlowCall {
  headers: Headers;
  readCookie: (name: string) => string | undefined;
  /**
   * Receives each `set-cookie` the auth library produced. Server actions pass
   * a writer backed by Next's cookie store (there is no response object to
   * attach them to); pages and tests may omit it.
   */
  setCookie?: (entry: string) => void;
}

const INVALID_CREDENTIALS = "Email or password is incorrect.";
const EXPIRED_LINK = "That link is invalid or has expired.";
const GENERIC_FAILURE = "Something went wrong. Please try again.";

function failure(
  code: "invalid" | "error" | "forbidden",
  message: string,
): ActionResult<never> {
  return { ok: false, code, message };
}

/** Normalised outcome of an auth endpoint called in response mode. */
interface AuthCallFailure {
  status: number;
  code?: string;
  message?: string;
}

/**
 * Runs an auth endpoint with `asResponse: true` so its `set-cookie` headers
 * are reachable, and folds both ways it can fail — a non-2xx response *or* a
 * thrown `APIError` — into one shape.
 */
async function callAuth(
  run: () => Promise<Response>,
): Promise<{ response: Response } | AuthCallFailure> {
  try {
    const response = await run();
    if (response.ok) return { response };
    const body = (await response.json().catch(() => null)) as {
      code?: unknown;
      message?: unknown;
    } | null;
    return {
      status: response.status,
      code: typeof body?.code === "string" ? body.code : undefined,
      message: typeof body?.message === "string" ? body.message : undefined,
    };
  } catch (error) {
    const body = (
      error as { body?: { code?: unknown; message?: unknown } } | null
    )?.body;
    return {
      status: (error as { status?: number } | null)?.status ?? 500,
      code: typeof body?.code === "string" ? body.code : undefined,
      message: typeof body?.message === "string" ? body.message : undefined,
    };
  }
}

/** Forwards a successful response's cookies to the caller's cookie store. */
function forwardCookies(
  response: Response,
  setCookie: FlowCall["setCookie"],
): void {
  if (!setCookie) return;
  for (const entry of response.headers.getSetCookie()) setCookie(entry);
}

function rateLimited(error: unknown): ActionResult<never> {
  const message = error instanceof Error ? error.message : "Too many attempts.";
  return { ok: false, code: "rate_limited", message };
}

async function guard(
  policy: Parameters<typeof enforceRateLimit>[0],
  ip: string,
) {
  try {
    await enforceRateLimit(policy, ip);
    return null;
  } catch (error) {
    return rateLimited(error);
  }
}

/** Lower-cased, trimmed — the column is unique on the normalized value. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Only same-site absolute paths are ever redirected to: `?next=//evil.example`
 * must land on the default home instead of off-site.
 */
export function safeNextPath(next: string | undefined | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  // Browsers read `/\evil.example` as `//evil.example`, i.e. off-site.
  if (next.startsWith("/\\")) return null;
  // Control characters would smuggle a second header into the redirect.
  if (next.split("").some((character) => character.charCodeAt(0) < 0x20)) {
    return null;
  }
  return next;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
}

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const db = await getDb();
  const rows = await db.query<UserRow[]>(
    `SELECT id, name, email, role, status, email_verified AS "emailVerified"
       FROM "user"
      WHERE lower(email) = lower($1)`,
    [email],
  );
  return rows[0] ?? null;
}

async function findUserById(id: string): Promise<UserRow | null> {
  const db = await getDb();
  const rows = await db.query<UserRow[]>(
    `SELECT id, name, email, role, status, email_verified AS "emailVerified"
       FROM "user"
      WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

function sessionUserOf(row: UserRow): SessionUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
  };
}

/** Where a resolved context should land — the tenant chooser when undecided. */
export function destinationFor(auth: AuthContext | null): string {
  if (!auth) return "/sign-in";
  if (auth.preview) return homePathFor(auth);
  const needsTenant =
    auth.role === "MERCHANT_OWNER" ||
    auth.role === "MERCHANT_MANAGER" ||
    auth.role === "MERCHANT_STAFF";
  if (needsTenant && auth.merchantId === null) return "/choose-merchant";
  return homePathFor(auth);
}

export interface SignInInput extends FlowCall {
  email: string;
  password: string;
}

export async function performSignIn(
  input: SignInInput,
): Promise<ActionResult<{ redirectTo: string }>> {
  const ip = clientIp(input.headers);
  const blocked = await guard("login", ip);
  if (blocked) return blocked;

  const email = normalizeEmail(input.email);
  const account = await findUserByEmail(email);

  // Never reveal which half was wrong: unknown address, suspended account and
  // bad password all read the same to the caller (the audit trail knows).
  if (!account) {
    await recordAudit({
      action: "auth.login_failed",
      resource: "user",
      ipAddress: ip,
      metadata: { reason: "unknown_account" },
    });
    return failure("invalid", INVALID_CREDENTIALS);
  }
  if (account.status !== "active") {
    await recordAudit({
      action: "auth.login_failed",
      resource: "user",
      actorId: account.id,
      ipAddress: ip,
      metadata: { reason: "account_disabled" },
    });
    return failure("invalid", INVALID_CREDENTIALS);
  }

  const options = {
    body: { email, password: input.password },
    headers: input.headers,
    asResponse: true,
  };
  const outcome = await callAuth(
    () => getAuth().api.signInEmail(options) as unknown as Promise<Response>,
  );

  if ("status" in outcome) {
    getLogger().debug(
      { status: outcome.status, code: outcome.code },
      "sign-in rejected by better-auth",
    );
    const notVerified = outcome.code === "EMAIL_NOT_VERIFIED";
    await recordAudit({
      action: "auth.login_failed",
      resource: "user",
      actorId: account.id,
      ipAddress: ip,
      metadata: {
        reason: notVerified ? "email_not_verified" : "invalid_credentials",
      },
    });
    // The one failure worth distinguishing: credentials were fine but the
    // address has not been verified yet, and the user needs to know why.
    if (notVerified) {
      return failure(
        "invalid",
        "That address hasn't been verified yet — open the link we emailed you, then sign in again.",
      );
    }
    return failure("invalid", INVALID_CREDENTIALS);
  }

  forwardCookies(outcome.response, input.setCookie);

  await recordAudit({
    action: "auth.login",
    resource: "user",
    actorId: account.id,
    actorRole: account.role,
    ipAddress: ip,
  });

  const context = await contextForUser(
    sessionUserOf(account),
    input.readCookie,
  );
  return { ok: true, data: { redirectTo: destinationFor(context) } };
}

export interface SignUpInput extends FlowCall {
  name: string;
  email: string;
  password: string;
}

/**
 * Registration creates a *platform identity* with the database defaults
 * (`role = 'CUSTOMER'`, `status = 'active'`). Nothing about roles or merchants
 * is accepted from the client: merchant accounts are provisioned by the
 * merchant onboarding flow, not by the sign-up form.
 */
export async function performSignUp(
  input: SignUpInput,
): Promise<ActionResult<{ redirectTo: string; verifyEmail: boolean }>> {
  const ip = clientIp(input.headers);
  const blocked = await guard("register", ip);
  if (blocked) return blocked;

  const email = normalizeEmail(input.email);
  const options = {
    body: { name: input.name.trim(), email, password: input.password },
    headers: input.headers,
    asResponse: true,
  };
  const outcome = await callAuth(
    () => getAuth().api.signUpEmail(options) as unknown as Promise<Response>,
  );

  if ("status" in outcome) {
    getLogger().debug(
      { status: outcome.status, code: outcome.code },
      "registration rejected",
    );
    if (outcome.status === 409 || outcome.code === "USER_ALREADY_EXISTS") {
      return failure("invalid", "An account with that email already exists.");
    }
    return failure("invalid", GENERIC_FAILURE);
  }

  forwardCookies(outcome.response, input.setCookie);
  const created = (await outcome.response.json()) as {
    user?: { id?: unknown };
  };
  const userId = typeof created.user?.id === "string" ? created.user.id : null;
  if (!userId) return failure("invalid", GENERIC_FAILURE);

  await recordAudit({
    action: "auth.registered",
    resource: "user",
    actorId: userId,
    ipAddress: ip,
    metadata: { email },
  });

  const verifyEmail = requireEmailVerification();
  const account = await findUserById(userId);
  const context = account
    ? await contextForUser(sessionUserOf(account), input.readCookie)
    : null;

  return {
    ok: true,
    data: {
      redirectTo: verifyEmail
        ? "/verify-email?sent=1"
        : destinationFor(context),
      verifyEmail,
    },
  };
}

export async function performSignOut(
  input: FlowCall,
): Promise<ActionResult<{ userId: string | null }>> {
  const headers = input.headers;
  let actorId: string | null = null;
  try {
    const current = await getAuth().api.getSession({ headers });
    actorId = current?.user?.id ?? null;
  } catch (error) {
    // An unreadable session is still worth ending: carry on with sign-out.
    getLogger().warn({ err: error }, "session unreadable during sign-out");
  }

  const options = { headers, asResponse: true };
  const outcome = await callAuth(
    () => getAuth().api.signOut(options) as unknown as Promise<Response>,
  );
  if ("status" in outcome) {
    getLogger().warn(
      { status: outcome.status, code: outcome.code },
      "sign-out rejected",
    );
    return failure("error", GENERIC_FAILURE);
  }

  // The response clears the session cookie (and the cookie cache) — it has to
  // reach the browser or the next request would still look authenticated.
  forwardCookies(outcome.response, input.setCookie);

  await recordAudit({
    action: "auth.logout",
    resource: "user",
    actorId,
    ipAddress: clientIp(headers),
  });
  return { ok: true, data: { userId: actorId } };
}

export async function performRequestPasswordReset(
  input: FlowCall & { email: string },
): Promise<ActionResult<{ message: string }>> {
  const ip = clientIp(input.headers);
  const blocked = await guard("passwordReset", ip);
  if (blocked) return blocked;

  const email = normalizeEmail(input.email);
  try {
    await getAuth().api.requestPasswordReset({
      body: { email },
      headers: input.headers,
    });
  } catch (error) {
    // Same answer either way: whether the address exists is not ours to say.
    getLogger().debug({ err: error }, "password reset request rejected");
  }

  await recordAudit({
    action: "auth.password_reset_requested",
    resource: "user",
    ipAddress: ip,
    metadata: { email },
  });

  return {
    ok: true,
    data: {
      message:
        "If an account exists for that address, a reset link is on its way. The link is valid for one hour.",
    },
  };
}

export async function performResetPassword(
  input: FlowCall & { token: string; newPassword: string },
): Promise<ActionResult<{ redirectTo: string }>> {
  const ip = clientIp(input.headers);
  const blocked = await guard("passwordReset", ip);
  if (blocked) return blocked;

  try {
    await getAuth().api.resetPassword({
      body: { token: input.token, newPassword: input.newPassword },
      headers: input.headers,
    });
  } catch (error) {
    getLogger().debug({ err: error }, "password reset rejected");
    await recordAudit({
      action: "auth.login_failed",
      resource: "user",
      ipAddress: ip,
      metadata: { reason: "reset_token_invalid" },
    });
    return failure("invalid", EXPIRED_LINK);
  }

  await recordAudit({
    action: "auth.password_reset_completed",
    resource: "user",
    ipAddress: ip,
  });

  return { ok: true, data: { redirectTo: "/sign-in?reset=1" } };
}

export async function performVerifyEmail(
  input: FlowCall & { token: string },
): Promise<ActionResult<{ redirectTo: string }>> {
  const ip = clientIp(input.headers);
  const blocked = await guard("tokenResolve", ip);
  if (blocked) return blocked;

  try {
    await getAuth().api.verifyEmail({
      query: { token: input.token },
      headers: input.headers,
    });
  } catch (error) {
    getLogger().debug({ err: error }, "email verification rejected");
    return failure("invalid", EXPIRED_LINK);
  }

  await recordAudit({
    action: "auth.email_verified",
    resource: "user",
    ipAddress: ip,
  });

  return { ok: true, data: { redirectTo: "/sign-in?verified=1" } };
}

export async function performResendVerification(
  input: FlowCall & { email: string },
): Promise<ActionResult<{ message: string }>> {
  const ip = clientIp(input.headers);
  const blocked = await guard("passwordReset", ip);
  if (blocked) return blocked;

  const email = normalizeEmail(input.email);
  try {
    await getAuth().api.sendVerificationEmail({
      body: { email },
      headers: input.headers,
    });
  } catch (error) {
    getLogger().debug({ err: error }, "verification email request rejected");
  }

  await recordAudit({
    action: "auth.email_verification_requested",
    resource: "user",
    ipAddress: ip,
    metadata: { email },
  });

  return {
    ok: true,
    data: {
      message: "If that address needs verifying, a new link is on its way.",
    },
  };
}

/** Tenants this identity may switch to (the chooser lists these). */
export async function loadTenantChoices(
  userId: string,
): Promise<TenantCandidate[]> {
  const account = await findUserById(userId);
  if (!account) return [];
  return listTenantCandidates(sessionUserOf(account));
}

/**
 * `set-cookie` entry for the validated tenant choice, so the flow itself can
 * record it (the server action forwards it into Next's cookie store, tests
 * read it back the same way a browser would).
 */
export function activeMerchantCookieEntry(merchantId: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return (
    `${ACTIVE_MERCHANT_COOKIE}=${merchantId}; Path=/; ` +
    `Max-Age=${30 * 24 * 60 * 60}; HttpOnly; SameSite=Lax${secure}`
  );
}

/**
 * Validates that the session may act inside `merchantId` *now* — membership
 * active, merchant not suspended — and only then records the choice.
 */
export async function performSetActiveMerchant(
  input: FlowCall & { auth: AuthContext; merchantId: string },
): Promise<ActionResult<{ merchantId: string }>> {
  const { auth, merchantId } = input;
  const allowed = await loadTenantChoices(auth.userId);
  const match = allowed.find(
    (candidate) => candidate.merchantId === merchantId,
  );

  if (!match) {
    await recordAudit({
      action: "tenant.access_denied",
      resource: "merchant",
      merchantId: null,
      actorId: auth.userId,
      actorRole: auth.role,
      ipAddress: clientIp(input.headers),
      metadata: { reason: "tenant_not_permitted", requested: merchantId },
    });
    return failure("forbidden", "That workspace is not available to you.");
  }

  await recordAudit({
    action: "tenant.selected",
    resource: "merchant",
    merchantId,
    actorId: auth.userId,
    actorRole: auth.role,
    ipAddress: clientIp(input.headers),
  });

  // Only a validated choice is ever written to the cookie.
  input.setCookie?.(activeMerchantCookieEntry(merchantId));

  return { ok: true, data: { merchantId } };
}

export { ACTIVE_MERCHANT_COOKIE };
