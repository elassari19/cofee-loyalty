import type { EntityTarget, ObjectLiteral, SelectQueryBuilder } from "typeorm";

import { getDb } from "@/db/connection";
import { recordAudit } from "@/lib/audit";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

import type { AuthContext } from "./context";

/**
 * Tenant context enforcement (checklist §5 — "Derive tenant context from the
 * authenticated session and membership relationship on the server. Never trust
 * `merchantId` from the frontend"; PRD §36).
 *
 * Three layers, applied in order by the callers:
 *
 *   1. `requireTenant(auth)` — the caller must have an *active* tenant.
 *      A suspended merchant, a disabled membership or "no tenant chosen yet"
 *      all fail closed with 403, and the denial itself is audited.
 *   2. `scopedQuery` and the `scoped*` helpers — every read carries the tenant
 *      predicate in SQL, so an id from another merchant is a 404, not a leak.
 *   3. Capability checks in `./guard` — *whether* this role may act at all.
 *
 * Nothing here accepts a merchant id from the client: the only tenant that is
 * ever used is the one resolved from the session.
 */

/** Returns the active tenant id, or throws 403 after auditing the denial. */
export function requireTenant(auth: AuthContext): string {
  if (auth.merchantId) return auth.merchantId;

  void recordAudit({
    action: "tenant.access_denied",
    resource: "merchant",
    merchantId: null,
    actorId: auth.preview ? null : auth.userId,
    actorRole: auth.role,
    metadata: {
      reason: auth.preview ? "preview_context" : "no_active_tenant",
      preview: auth.preview,
    },
  });
  throw new ForbiddenError();
}

export interface ScopedQueryOptions {
  /** Property holding the tenant id. Defaults to `merchantId`. */
  tenantColumn?: string;
  /** Extra property predicates, e.g. `{ status: "active" }`. */
  where?: Record<string, unknown>;
  /** Relations to join, e.g. `["program"]`. */
  relations?: string[];
}

/**
 * Query builder for `entity` with the caller's tenant already applied.
 * Ordering, pagination and further filters stay with the caller.
 */
export async function scopedQuery<T extends ObjectLiteral>(
  auth: AuthContext,
  entity: EntityTarget<T>,
  options: ScopedQueryOptions = {},
): Promise<SelectQueryBuilder<T>> {
  const merchantId = requireTenant(auth);
  const db = await getDb();
  const query = db.getRepository(entity).createQueryBuilder("entity");

  for (const relation of options.relations ?? []) {
    query.leftJoinAndSelect(`entity.${relation}`, relation);
  }
  for (const [key, value] of Object.entries(options.where ?? {})) {
    query.andWhere(`entity.${key} = :${key}`, { [key]: value });
  }

  const column = options.tenantColumn ?? "merchantId";
  return query.andWhere(`entity.${column} = :__merchantId`, {
    __merchantId: merchantId,
  });
}

/** One row inside the caller's tenant, or `null`. */
export async function scopedFind<T extends ObjectLiteral>(
  auth: AuthContext,
  entity: EntityTarget<T>,
  id: string,
  options: ScopedQueryOptions = {},
): Promise<T | null> {
  const query = await scopedQuery(auth, entity, options);
  return query.andWhere("entity.id = :__id", { __id: id }).getOne();
}

/**
 * One row inside the caller's tenant, or 404.
 *
 * 404 rather than 403 on purpose: a row that exists in another tenant must be
 * indistinguishable from one that does not exist at all.
 */
export async function scopedFindOrFail<T extends ObjectLiteral>(
  auth: AuthContext,
  entity: EntityTarget<T>,
  id: string,
  options: ScopedQueryOptions = {},
): Promise<T> {
  const row = await scopedFind(auth, entity, id, options);
  if (!row) throw new NotFoundError();
  return row;
}

/** Every row of `entity` inside the caller's tenant. */
export async function scopedList<T extends ObjectLiteral>(
  auth: AuthContext,
  entity: EntityTarget<T>,
  options: ScopedQueryOptions = {},
): Promise<T[]> {
  const query = await scopedQuery(auth, entity, options);
  return query.getMany();
}

/** Row count inside the caller's tenant. */
export async function scopedCount<T extends ObjectLiteral>(
  auth: AuthContext,
  entity: EntityTarget<T>,
  options: ScopedQueryOptions = {},
): Promise<number> {
  const query = await scopedQuery(auth, entity, options);
  return query.getCount();
}
