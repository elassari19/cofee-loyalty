import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { withApiHandler, type ApiHandler } from "@/lib/api";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { PATHNAME_HEADER } from "@/lib/request-context";

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
  const requestHeaders = await headers();
  const auth = await resolveAuthFromCookieSource(cookieStore, requestHeaders);

  if (!auth) {
    redirect(signInPath(requestHeaders.get(PATHNAME_HEADER)));
  }

  if (capabilities && !can(auth, capabilities)) {
    redirect("/403");
  }

  return auth;
}

/**
 * Builds the sign-in entry point for a visitor who was turned away: the page
 * they asked for travels along as `?next=` (validated again on the sign-in
 * page before anything redirects there).
 */
function signInPath(destination: string | null): string {
  if (!destination) return "/sign-in";
  if (!destination.startsWith("/") || destination.startsWith("//")) {
    return "/sign-in";
  }
  return `/sign-in?next=${encodeURIComponent(destination)}`;
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
  const requestHeaders = await headers();
  const auth = await resolveAuthFromCookieSource(cookieStore, requestHeaders);

  if (!auth) {
    redirect(signInPath(requestHeaders.get(PATHNAME_HEADER)));
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
