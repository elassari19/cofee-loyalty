import type { NextRequest } from "next/server";

import { isRole, roleLabel, ROLE_HOME, type Role } from "./roles";
import { resolveSession } from "./session";

/**
 * Authenticated request context (checklist §3 bullet 6, §5).
 *
 * Resolution order:
 *   1. The session resolver — Better Auth by default (`./session`), which is
 *      the only production source of truth: the session cookie plus the
 *      platform user row it points at.
 *   2. A development-only "view as role" preview cookie, so the role-aware
 *      shells built in §3 can be reviewed before login ships. The cookie is
 *      *ignored entirely* when `NODE_ENV === "production"` and the endpoint
 *      that sets it refuses to run in production, so there are two layers of
 *      protection between the preview and a real deployment.
 *
 * Every guard in `./guard` goes through this module: pages, layouts and API
 * routes never read cookies or headers directly, so session handling stays in
 * one place and every entry point sees the same caller.
 */

export interface AuthContext {
  /** Stable principal id. Preview contexts use a synthetic, non-DB id. */
  userId: string;
  role: Role;
  /** Human-readable name safe to render in the shell header. */
  displayName: string;
  /**
   * Active merchant tenant, derived server-side from the session's platform
   * role, its merchant memberships and the validated active-tenant cookie —
   * never from anything the client sends. `null` for platform administrators,
   * customers without a membership, merchant identities without an active
   * tenant, and every dev-preview context.
   */
  merchantId: string | null;
  /** True while the context came from the dev preview cookie. */
  preview: boolean;
}

export interface CookieSource {
  get(name: string): { value: string } | undefined;
  /** Every cookie in the request, used to reconstruct a `cookie` header. */
  getAll?(): { name: string; value: string }[];
}

/**
 * What a session resolver is given: cookie access (fast paths, the active
 * tenant cookie) and the raw request headers, which Better Auth needs to read
 * the session cookie exactly as the browser sent it.
 */
export interface SessionInput {
  readCookie: (name: string) => string | undefined;
  headers: Headers;
}

export type SessionResolver = (
  input: SessionInput,
) => Promise<AuthContext | null> | AuthContext | null;

let sessionResolver: SessionResolver = resolveSession;

/**
 * Install a production session resolver. The default is already the Better
 * Auth resolver from `./session`; this exists for tests and for swapping the
 * strategy without touching every call site.
 */
export function setSessionResolver(resolver: SessionResolver): void {
  sessionResolver = resolver;
}

/** Test-only: restore a resolver that always reports "no session". */
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

async function resolve(input: SessionInput): Promise<AuthContext | null> {
  const session = await sessionResolver(input);
  if (session) return session;
  return readPreview(input.readCookie(PREVIEW_COOKIE));
}

/** Resolves the caller for an incoming route-handler request. */
export async function resolveAuthFromRequest(
  request: NextRequest,
): Promise<AuthContext | null> {
  return resolve({
    readCookie: (name) => request.cookies.get(name)?.value,
    headers: request.headers,
  });
}

/**
 * Resolves the caller inside a server component (layout/page).
 *
 * `requestHeaders` (from `next/headers`) is optional: when present the whole
 * header set is handed to the resolver, which lets Better Auth tell a render
 * pass from an action and skip cookie writes it cannot perform during render.
 * Without it the `cookie` header alone is rebuilt from the cookie store.
 */
export async function resolveAuthFromCookieSource(
  source: CookieSource,
  requestHeaders?: Headers,
): Promise<AuthContext | null> {
  const readCookie = (name: string) => source.get(name)?.value;
  const entries = source.getAll?.() ?? [];
  const cookieHeader = entries
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");

  const headers = new Headers(requestHeaders ?? {});
  if (cookieHeader && !headers.has("cookie")) {
    headers.set("cookie", cookieHeader);
  }
  return resolve({ readCookie, headers });
}

/** The route a context should land on after sign-in or preview selection. */
export function homePathFor(auth: AuthContext): string {
  return ROLE_HOME[auth.role];
}
