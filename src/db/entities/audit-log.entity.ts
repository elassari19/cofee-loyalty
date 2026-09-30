import { EntitySchema } from "typeorm";
import { MerchantEntity } from "./merchant.entity";

/**
 * Append-only audit trail of security-sensitive actions (PRD §37,
 * checklist §4/§5).
 *
 * - `merchant_id` is nullable: platform-level actions (merchant suspended,
 *   admin signed in) have no tenant. Tenant-owned actions always carry one,
 *   which makes the log tenant-scopable like every other table.
 * - `actor_id` is a plain `varchar` **without a foreign key on purpose**: a
 *   log row must survive account changes, and the immutability trigger below
 *   forbids the `SET NULL` that a foreign key would try to perform. The
 *   actor's id is written as it was at the time of the action.
 * - Rows are never updated or deleted (same `BEFORE UPDATE OR DELETE`
 *   trigger as the ledger).
 */
export interface AuditLog {
  id: string;
  merchantId: string | null;
  actorId: string | null;
  /** The actor's role at the time of the action, captured for the record. */
  actorRole: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: Date;
}

export const AuditLogEntity = new EntitySchema<AuditLog>({
  name: "audit_log",
  tableName: "audit_log",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    merchantId: { type: "uuid", name: "merchant_id", nullable: true },
    actorId: { type: "varchar", length: 64, name: "actor_id", nullable: true },
    actorRole: {
      type: "varchar",
      length: 30,
      name: "actor_role",
      nullable: true,
    },
    action: { type: "varchar", length: 80 },
    resource: { type: "varchar", length: 80 },
    resourceId: {
      type: "varchar",
      length: 120,
      name: "resource_id",
      nullable: true,
    },
    metadata: { type: "jsonb", default: "{}" },
    ipAddress: {
      type: "varchar",
      length: 45,
      name: "ip_address",
      nullable: true,
    },
    createdAt: {
      type: "timestamptz",
      name: "created_at",
      default: () => "CURRENT_TIMESTAMP",
    },
  },
  checks: [
    { name: "ck_audit_log_action", expression: "length(btrim(action)) > 0" },
    {
      name: "ck_audit_log_resource",
      expression: "length(btrim(resource)) > 0",
    },
  ],
  foreignKeys: [
    {
      name: "fk_audit_log_merchant",
      target: MerchantEntity,
      columnNames: ["merchant_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
  ],
  indices: [
    {
      name: "ix_audit_log_tenant_created",
      columns: ["merchantId", "createdAt"],
    },
    { name: "ix_audit_log_actor_created", columns: ["actorId", "createdAt"] },
    { name: "ix_audit_log_action_created", columns: ["action", "createdAt"] },
  ],
});
