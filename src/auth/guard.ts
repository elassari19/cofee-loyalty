import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { withApiHandler, type ApiHandler } from "@/lib/api";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

import {
  resolveAuthFromCookieSource,
  resolveAuthFromRequest,
  type AuthContext,
} from "./context";
import {
  audienceForRole,
  hasAllCapabilities,
  type Audience,
  type Capability,
} from "./roles";

/**
 * Server-side authorization guards (checklist §3 bullet 6).
 *
 * Two entry points, one job each — every server operation must go through one
 * of them independently of what the UI renders:
 *
 *   - `withApiGuard(...)`  wraps a route handler: resolves the caller from the
 *     request, rejects anonymous callers (401) and callers missing a
 *     capability (403) before the handler body ever runs.
 *   - `requirePageAccess()` guards layouts/pages: unauthenticated visitors are
 *     sent to `/sign-in`, authenticated visitors without the capability are
 *     sent to `/403`.
 *
 * Navigation menus are filtered with the *same* capability matrix, but hiding a
 * link is never the protection — a direct URL or a direct `fetch` hits the
 * guard regardless.
 */

/** Layout/page guard. Redirects: no session → `/sign-in`, no capability → `/403`. */
export async function requirePageAccess(
  capabilities?: Capability | readonly Capability[],
): Promise<AuthContext> {
  const cookieStore = await cookies();
  const auth = await resolveAuthFromCookieSource(cookieStore);

  if (!auth) {
    // TODO(§5): preserve the intended destination (`?next=`) once the real
    // sign-in flow exists; the dev preview picks a destination itself.
    redirect("/sign-in");
  }

  if (capabilities && !can(auth, capabilities)) {
    redirect("/403");
  }

  return auth;
}

/** Whether the role belongs to one of the listed audiences. */
export function matchesAudience(
  role: AuthContext["role"],
  audiences: Audience | readonly Audience[],
): boolean {
  const allowed = typeof audiences === "string" ? [audiences] : audiences;
  return allowed.includes(audienceForRole(role));
}

/**
 * Route-group guard: the shell/layout of an audience (platform, merchant,
 * staff, customer) validates that the caller belongs to that audience at all.
 * Capability checks for the specific page happen in `requirePageAccess` on the
 * page itself — two independent questions, two independent checks.
 */
export async function requirePageAudience(
  audiences: Audience | readonly Audience[],
): Promise<AuthContext> {
  const cookieStore = await cookies();
  const auth = await resolveAuthFromCookieSource(cookieStore);

  if (!auth) {
    redirect("/sign-in");
  }
  if (!matchesAudience(auth.role, audiences)) {
    redirect("/403");
  }

  return auth;
}

/** Whether the context holds every listed capability. */
export function can(
  auth: AuthContext,
  capabilities: Capability | readonly Capability[],
): boolean {
  const required = normalize(capabilities);
  return hasAllCapabilities(auth.role, required);
}

/** Throws `ForbiddenError` (403) unless the context holds every capability. */
export function requireCapability(
  auth: AuthContext,
  capabilities: Capability | readonly Capability[],
): void {
  if (!can(auth, capabilities)) {
    // Deliberately generic: never reveal which capability was missing.
    throw new ForbiddenError();
  }
}

export type GuardedApiHandler<Context = unknown> = (
  request: NextRequest,
  context: Context,
  auth: AuthContext,
) => Promise<Response> | Response;

function normalize(
  capabilities: Capability | readonly Capability[],
): readonly Capability[] {
  return typeof capabilities === "string" ? [capabilities] : capabilities;
}

/**
 * Route-handler guard.
 *
 *   export const GET = withApiGuard("platform.manage", async (req, ctx, auth) => {
 *     return Response.json(await loadPlatformOverview(auth));
 *   });
 *
 * Order of operations matches PRD §34: authentication → authorization →
 * (tenant validation and business validation happen inside the handler) →
 * database operation. Errors flow through the shared `withApiHandler`
 * envelope, so a denied call looks like every other API error.
 */
export function withApiGuard<Context = unknown>(
  capabilities: Capability | readonly Capability[],
  handler: GuardedApiHandler<Context>,
): ApiHandler<Context> {
  const required = normalize(capabilities);

  return withApiHandler(async (request, context) => {
    const auth = await resolveAuthFromRequest(request);
    if (!auth) throw new UnauthorizedError();
    requireCapability(auth, required);
    return handler(request, context, auth);
  });
}
