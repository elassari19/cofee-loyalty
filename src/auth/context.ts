import type { NextRequest } from "next/server";

import { isRole, roleLabel, ROLE_HOME, type Role } from "./roles";

/**
 * Authenticated request context (checklist §3 bullet 6, §5).
 *
 * Resolution order:
 *   1. The registered session resolver — installed by checklist §5 once
 *      Better Auth sessions exist. It is the only production source of truth.
 *   2. A development-only "view as role" preview cookie, so the role-aware
 *      shells built in §3 can be reviewed before login ships. The cookie is
 *      *ignored entirely* when `NODE_ENV === "production"` and the endpoint
 *      that sets it refuses to run in production, so there are two layers of
 *      protection between the preview and a real deployment.
 *
 * Every guard in `./guard` goes through this module: pages, layouts and API
 * routes never read cookies or headers directly, so §5 can swap in Better Auth
 * without touching a single route.
 */

export interface AuthContext {
  /** Stable principal id. Preview contexts use a synthetic, non-DB id. */
  userId: string;
  role: Role;
  /** Human-readable name safe to render in the shell header. */
  displayName: string;
  /**
   * Active merchant tenant. `null` for platform administrators, customers
   * without an active membership, and every dev-preview context; §5 derives
   * it from the authenticated session + merchant membership.
   */
  merchantId: string | null;
  /** True while the context came from the dev preview cookie. */
  preview: boolean;
}

export interface CookieSource {
  get(name: string): { value: string } | undefined;
}

export type SessionResolver = (
  readCookie: (name: string) => string | undefined,
) => Promise<AuthContext | null> | AuthContext | null;

let sessionResolver: SessionResolver = () => null;

/**
 * Install the production session resolver (checklist §5 / Better Auth).
 * Idempotent per process; called once during auth bootstrap.
 */
export function setSessionResolver(resolver: SessionResolver): void {
  sessionResolver = resolver;
}

/** Test-only: restore the default (no session) resolver. */
export function resetSessionResolver(): void {
  sessionResolver = () => null;
}

export const PREVIEW_COOKIE = "cofe_preview_role";

export function isPreviewEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

function previewContext(role: Role): AuthContext {
  return {
    userId: `preview:${role}`,
    role,
    displayName: `${roleLabel(role)} (preview)`,
    merchantId: null,
    preview: true,
  };
}

function readPreview(value: string | undefined): AuthContext | null {
  if (!value || !isPreviewEnabled()) return null;
  return isRole(value) ? previewContext(value) : null;
}

async function resolve(
  readCookie: (name: string) => string | undefined,
): Promise<AuthContext | null> {
  const session = await sessionResolver(readCookie);
  if (session) return session;
  return readPreview(readCookie(PREVIEW_COOKIE));
}

/** Resolves the caller for an incoming route-handler request. */
export async function resolveAuthFromRequest(
  request: NextRequest,
): Promise<AuthContext | null> {
  return resolve((name) => request.cookies.get(name)?.value);
}

/** Resolves the caller inside a server component (layout/page). */
export async function resolveAuthFromCookieSource(
  source: CookieSource,
): Promise<AuthContext | null> {
  return resolve((name) => source.get(name)?.value);
}

/** The route a context should land on after sign-in or preview selection. */
export function homePathFor(auth: AuthContext): string {
  return ROLE_HOME[auth.role];
}
