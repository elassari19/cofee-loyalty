import { randomUUID } from "node:crypto";

import { getDb } from "@/db/connection";
import { getLogger } from "./logger";

/**
 * Audit trail writer (PRD §37, checklist §5 — "Record audit events for
 * authentication and sensitive role, merchant, customer, loyalty, and
 * redemption actions").
 *
 * - `recordAudit` is **best effort**: it never throws into the caller, because
 *   a failed log write must not roll back a completed sign-in or redemption.
 *   A failure is reported loudly in the server log instead.
 * - Metadata is scrubbed before it is stored: anything that looks like a
 *   credential or a single-use token is replaced, so the trail answers *who
 *   did what* without becoming a second copy of a secret.
 * - Rows are written through the same `DataSource` as the rest of the app and
 *   are append-only at the database level (triggers from checklist §4).
 */

export const AUDIT_ACTIONS = [
  "auth.registered",
  "auth.login",
  "auth.login_failed",
  "auth.logout",
  "auth.password_reset_requested",
  "auth.password_reset_completed",
  "auth.password_changed",
  "auth.email_verification_requested",
  "auth.email_verified",
  "auth.session_expired",
  "tenant.access_denied",
  "tenant.selected",
  "merchant.created",
  "merchant.updated",
  "merchant.suspended",
  "merchant.activated",
  "user.invited",
  "user.role_changed",
  "user.disabled",
  "user.enabled",
  "customer.created",
  "customer.updated",
  "customer.enrolled",
  "customer.identity_rotated",
  "loyalty.program_updated",
  "loyalty.reward_created",
  "loyalty.reward_updated",
  "loyalty.reward_activated",
  "loyalty.reward_deactivated",
  "loyalty.earned",
  "loyalty.adjusted",
  "redemption.issued",
  "redemption.verified",
  "redemption.completed",
  "redemption.cancelled",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEvent {
  action: AuditAction;
  /** Table or area the action touched, e.g. `user`, `merchant`, `redemption`. */
  resource: string;
  resourceId?: string | null;
  merchantId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEY =
  /(pass(word)?|token|secret|authorization|cookie|credential|otp|code|pin|hash)/i;
const REDACTED = "[redacted]";
const MAX_STRING = 500;

/** Deep copy with credential-shaped values replaced and strings bounded. */
export function sanitizeAuditMetadata(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((entry) => sanitizeAuditMetadata(entry, depth + 1));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY.test(key)
        ? REDACTED
        : sanitizeAuditMetadata(entry, depth + 1);
    }
    return result;
  }
  return value;
}

/** Writes one audit row. Never throws — see the module comment. */
export async function recordAudit(event: AuditEvent): Promise<void> {
  try {
    const db = await getDb();
    // Inserted as plain SQL (like the seed does): the jsonb `metadata` column
    // is easier to express as a bound `::jsonb` parameter than through
    // TypeORM's deep-partial insert typing.
    await db.query(
      `INSERT INTO audit_log
         (id, merchant_id, actor_id, actor_role, action, resource, resource_id, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        randomUUID(),
        event.merchantId ?? null,
        event.actorId ?? null,
        event.actorRole ?? null,
        event.action,
        event.resource,
        event.resourceId ?? null,
        JSON.stringify(sanitizeAuditMetadata(event.metadata ?? {}) ?? {}),
        event.ipAddress ?? null,
      ],
    );
  } catch (error) {
    getLogger().error(
      { err: error, action: event.action, resource: event.resource },
      "audit event could not be recorded",
    );
  }
}
