import { cookies, headers } from "next/headers";

import { resolveAuthFromCookieSource, type AuthContext } from "./context";
import { can } from "./guard";
import type { Capability } from "./roles";

/**
 * Server-action guard (checklist §3 bullet 6).
 *
 * Route handlers get `withApiGuard`; server actions get `guardedAction`. Both
 * answer the same question *inside the server operation* — who is calling, and
 * may they do this — before any state is touched, and both return the same
 * shape so clients can report a precise result:
 *
 *   const result = await deactivateReward(id);
 *   if (!result.ok) notify.error(result.message);
 *
 * Never throws for expected failures: an action failure is a *result* the UI
 * must show, not an exception that crashes the calling component.
 */

export type ActionFailureCode =
  "unauthorized" | "forbidden" | "invalid" | "rate_limited" | "error";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; code: ActionFailureCode; message: string };

export type ActionAccess = "anonymous" | "forbidden" | "allowed";

/** Pure decision helper — the piece unit tests assert against. */
export function evaluateActionAccess(
  auth: AuthContext | null,
  capabilities: Capability | readonly Capability[],
): ActionAccess {
  if (!auth) return "anonymous";
  return can(auth, capabilities) ? "allowed" : "forbidden";
}

const DENIED: Record<
  "anonymous" | "forbidden",
  { code: ActionFailureCode; message: string }
> = {
  anonymous: {
    code: "unauthorized",
    message: "Your session has ended. Sign in and try again.",
  },
  forbidden: {
    code: "forbidden",
    message: "Your role isn't allowed to make this change.",
  },
};

export const ACTION_ERROR_FALLBACK =
  "Something went wrong. Nothing was changed.";

/**
 * Runs `work` if `auth` holds `capabilities`. `work` may throw; the message
 * (when present) becomes the user-facing result, everything else is masked.
 */
export async function runGuarded<T>(
  auth: AuthContext | null,
  capabilities: Capability | readonly Capability[],
  work: (auth: AuthContext) => Promise<T> | T,
): Promise<ActionResult<T>> {
  const access = evaluateActionAccess(auth, capabilities);
  if (access === "anonymous") return { ok: false, ...DENIED.anonymous };
  if (access === "forbidden") return { ok: false, ...DENIED.forbidden };

  try {
    return { ok: true, data: await work(auth as AuthContext) };
  } catch (error) {
    return {
      ok: false,
      code: "error",
      message:
        error instanceof Error && error.message
          ? error.message
          : ACTION_ERROR_FALLBACK,
    };
  }
}

/** Server-action entry point: resolves the caller, then applies `runGuarded`. */
export async function guardedAction<T>(
  capabilities: Capability | readonly Capability[],
  work: (auth: AuthContext) => Promise<T> | T,
): Promise<ActionResult<T>> {
  const cookieStore = await cookies();
  const auth = await resolveAuthFromCookieSource(cookieStore, await headers());
  return runGuarded(auth, capabilities, work);
}
