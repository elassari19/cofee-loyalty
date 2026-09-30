import { getDb } from "@/db/connection";
import { getLogger } from "@/lib/logger";

import { getAuth } from "./config";
import type { AuthContext, SessionInput } from "./context";
import { isRole, type Role } from "./roles";

/**
 * Session → request context (checklist §5).
 *
 * This is the single place where "who is calling" is decided for real
 * sessions, and every rule it applies is server-side:
 *
 *   1. Better Auth resolves the session cookie against `session`/`user`.
 *      No cookie, an expired session, a revoked session or a non-`active`
 *      account all resolve to `null` — the caller is anonymous (401).
 *   2. The **role** comes from the database: the platform `user.role` plus,
 *      for merchant identities, the row in `merchant_membership`. Nothing the
 *      browser sends is ever consulted.
 *   3. The **tenant** comes from the memberships the session is actually
 *      allowed to use, narrowed by an active-tenant cookie that is validated
 *      against that list (it can only *choose*, never *grant*). Suspended
 *      merchants and disabled memberships are excluded, so a suspended tenant
 *      has no active context at all.
 *   4. A failure anywhere is treated as "no session": authorization fails
 *      closed instead of half-privileging an unreadable context.
 */

/** Cookie that records which verified tenant the shell should render. */
export const ACTIVE_MERCHANT_COOKIE = "cofe_active_merchant";

export interface TenantCandidate {
  merchantId: string;
  merchantName: string;
  /** Tenant role for merchant identities; customers always use `CUSTOMER`. */
  role: Role | null;
}

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: unknown;
  status?: unknown;
}

/** Active merchants the identity may operate in, with its tenant role. */
async function merchantCandidates(userId: string): Promise<TenantCandidate[]> {
  const db = await getDb();
  const rows = await db.query<
    Array<{
      merchant_id: string;
      merchant_name: string;
      role: string;
    }>
  >(
    `SELECT m.id AS merchant_id, m.name AS merchant_name, mm.role AS role
       FROM merchant_membership mm
       JOIN merchant m ON m.id = mm.merchant_id
      WHERE mm.user_id = $1
        AND mm.status = 'active'
        AND m.status <> 'suspended'
      ORDER BY m.name ASC, m.id ASC`,
    [userId],
  );
  return rows.map((row) => ({
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    role: isRole(row.role) ? row.role : null,
  }));
}

/** Merchants whose loyalty programme the customer's profile belongs to. */
async function customerCandidates(userId: string): Promise<TenantCandidate[]> {
  const db = await getDb();
  const rows = await db.query<
    Array<{ merchant_id: string; merchant_name: string }>
  >(
    `SELECT DISTINCT m.id AS merchant_id, m.name AS merchant_name
       FROM customer_profile cp
       JOIN loyalty_membership lm ON lm.customer_profile_id = cp.id
       JOIN merchant m ON m.id = lm.merchant_id
      WHERE cp.user_id = $1
        AND lm.status = 'active'
        AND m.status <> 'suspended'
      ORDER BY m.name ASC, m.id ASC`,
    [userId],
  );
  return rows.map((row) => ({
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    role: null,
  }));
}

/**
 * Narrows the candidate list to the active tenant: the cookie wins when it
 * still names an allowed merchant, a single candidate is selected
 * automatically, anything ambiguous resolves to "no tenant yet".
 */
function pickActiveTenant(
  candidates: TenantCandidate[],
  requested: string | undefined,
): TenantCandidate | null {
  if (requested) {
    const match = candidates.find(
      (candidate) => candidate.merchantId === requested,
    );
    if (match) return match;
  }
  if (candidates.length === 1) return candidates[0] ?? null;
  return null;
}

function displayNameOf(user: SessionUser): string {
  const name = typeof user.name === "string" ? user.name.trim() : "";
  if (name) return name;
  return typeof user.email === "string" ? user.email : "Signed-in user";
}

/**
 * Builds the request context for an identity that is already known to the
 * server — role, memberships and active tenant come from the database alone.
 *
 * Only trusted server code may call this (right after a successful sign-in,
 * or from `resolveSession` below): it proves nothing on its own.
 */
export async function contextForUser(
  user: SessionUser,
  readCookie: (name: string) => string | undefined,
): Promise<AuthContext | null> {
  if (typeof user.id !== "string") return null;
  // A disabled (or not yet activated) account keeps no usable session.
  if (user.status !== "active") return null;

  const displayName = displayNameOf(user);
  const requestedTenant = readCookie(ACTIVE_MERCHANT_COOKIE);

  if (user.role === "SUPER_ADMIN") {
    return {
      userId: user.id,
      role: "SUPER_ADMIN",
      displayName,
      merchantId: null,
      preview: false,
    };
  }

  if (user.role === "MERCHANT") {
    const active = pickActiveTenant(
      await merchantCandidates(user.id),
      requestedTenant,
    );
    return {
      userId: user.id,
      // Without an active tenant there is nothing to operate on; the role
      // still identifies the shell, `requireTenant` refuses the work.
      role: active?.role ?? "MERCHANT_OWNER",
      displayName,
      merchantId: active?.merchantId ?? null,
      preview: false,
    };
  }

  const customerTenant = pickActiveTenant(
    await customerCandidates(user.id),
    requestedTenant,
  );
  return {
    userId: user.id,
    role: "CUSTOMER",
    displayName,
    merchantId: customerTenant?.merchantId ?? null,
    preview: false,
  };
}

/** Resolves the Better Auth session for these headers, or `null`. */
export async function resolveSession(
  input: SessionInput,
): Promise<AuthContext | null> {
  try {
    const current = await getAuth().api.getSession({ headers: input.headers });
    const sessionUser = current?.user as SessionUser | undefined;
    if (!sessionUser || typeof sessionUser.id !== "string") return null;

    // The cookie proves *who* is calling; it deliberately says nothing about
    // *what* they may do. Role and status are re-read from the database on
    // every request so a disabled account or a demoted role takes effect on
    // the next call instead of when the session was issued.
    const db = await getDb();
    const rows = await db.query<
      Array<Pick<SessionUser, "id" | "name" | "email" | "role" | "status">>
    >(`SELECT id, name, email, role, status FROM "user" WHERE id = $1`, [
      sessionUser.id,
    ]);
    const user = rows[0];
    if (!user) return null;
    return await contextForUser(user, input.readCookie);
  } catch (error) {
    // Fail closed: an unreadable session is an anonymous caller, never a
    // privileged one.
    getLogger().error({ err: error }, "session could not be resolved");
    return null;
  }
}

/** Tenants the identity may become active in (used by the tenant chooser). */
export async function listTenantCandidates(
  user: SessionUser,
): Promise<TenantCandidate[]> {
  if (user.role === "SUPER_ADMIN") return [];
  if (user.role === "MERCHANT") return merchantCandidates(user.id);
  return customerCandidates(user.id);
}
