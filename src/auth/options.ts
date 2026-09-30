import type { BetterAuthOptions } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { buildAuthLink, sendAuthEmail } from "@/integrations/email";

/**
 * Better Auth options that carry no environment or database dependency
 * (ADR 0001), so two different consumers can import them safely:
 *
 *   - `src/auth/config.ts` builds the runtime instance on top of them;
 *   - `src/db/entities/auth-schemas.ts` derives the TypeORM `EntitySchema`s
 *     for the auth tables from them, which is what ships in the migration.
 *
 * Keeping the schema input free of `getEnv()` / `AppDataSource` is what lets
 * `pnpm db:migrate:generate` run with only `DATABASE_URL` exported.
 *
 * Cryptography is never implemented here: password hashing (scrypt), session
 * token minting, cookie signing and single-use token expiry all come from the
 * library (checklist §5 bullet 2 — "never invent password or session
 * cryptography").
 */

/** Session lifetime: 7 days, refreshed once a day while it is used. */
export const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;
/** Password reset links are short-lived. */
export const RESET_TOKEN_EXPIRES_IN_SECONDS = 60 * 60;
/** Verification links live for a day. */
export const VERIFICATION_TOKEN_EXPIRES_IN_SECONDS = 60 * 60 * 24;

function passwordResetEmail(data: {
  user: { email: string };
  token: string;
}): Promise<void> {
  const link = buildAuthLink("/reset-password", data.token);
  return sendAuthEmail({
    kind: "password-reset",
    to: data.user.email,
    subject: "Reset your loyalty platform password",
    link,
    text: [
      "Someone asked to reset the password for this account.",
      "",
      `Open this link to choose a new password (valid for one hour):`,
      "",
      link,
      "",
      "If you did not request this, you can ignore this message — the",
      "current password keeps working and no other session is affected",
      "until a reset is completed.",
    ].join("\n"),
  });
}

function verificationEmail(data: {
  user: { email: string };
  token: string;
}): Promise<void> {
  const link = buildAuthLink("/verify-email", data.token);
  return sendAuthEmail({
    kind: "email-verification",
    to: data.user.email,
    subject: "Verify your email address",
    link,
    text: [
      "Confirm this address to finish setting up your account.",
      "",
      `Open this link (valid for 24 hours):`,
      "",
      link,
    ].join("\n"),
  });
}

export const authOptions = {
  emailAndPassword: {
    enabled: true,
    // Sign-up stays open; merchant/customer provisioning is ours to do after
    // the account exists (checklist §6/§7) — never from client-supplied fields.
    minPasswordLength: 10,
    resetPasswordTokenExpiresIn: RESET_TOKEN_EXPIRES_IN_SECONDS,
    // A completed reset invalidates every other session (checklist §5:
    // "secure session expiration/invalidation").
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async (data: {
      user: { email: string };
      token: string;
    }) => passwordResetEmail(data),
  },
  emailVerification: {
    sendOnSignUp: true,
    expiresIn: VERIFICATION_TOKEN_EXPIRES_IN_SECONDS,
    sendVerificationEmail: async (data: {
      user: { email: string };
      token: string;
    }) => verificationEmail(data),
  },
  session: {
    expiresIn: SESSION_EXPIRES_IN_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
    // No cookie cache: every session read hits PostgreSQL, so a revoked or
    // expired session stops working on the next request instead of when a
    // cache entry ages out.
    cookieCache: { enabled: false },
  },
  /**
   * Better Auth's own limiter is off: authentication endpoints are rate limited
   * by `src/lib/rate-limit.ts` (Redis-backed, per-IP, with a memory fallback)
   * so login, registration and password reset share one implementation with the
   * QR/token and redemption-code limits required by checklist §5.
   */
  rateLimit: { enabled: false },
  /**
   * Must stay last (Better Auth requirement). It lets `auth.api.*` set session
   * cookies from server actions and route handlers through `next/headers`.
   */
  plugins: [nextCookies()],
} satisfies BetterAuthOptions;

/**
 * Email verification gating is environment-driven (`.env.example`), read raw on
 * purpose: this module must stay importable by the migration CLI, which only
 * guarantees `DATABASE_URL`.
 */
export function requireEmailVerification(): boolean {
  return process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true";
}
