import { EntitySchema } from "typeorm";
import {
  LOYALTY_TYPES,
  PROGRAM_STATUSES,
  sqlEnum,
  type LoyaltyType,
  type ProgramStatus,
} from "./enums";
import { MerchantEntity } from "./merchant.entity";

/**
 * A merchant's loyalty program — exactly one *active* program per merchant
 * (PRD §11/§12: the owner picks points **or** stamps, never a mix).
 *
 * The partial unique index `uq_loyalty_program_active_per_merchant` is what
 * makes that a database guarantee rather than a UI decision: a second
 * `status = 'active'` row for the same tenant cannot be inserted.
 *
 * `configuration` holds the rule set (earning rate, rounding, minimum
 * purchase, expiry, stamp thresholds) as `jsonb`, and `rule_version` is
 * bumped on every rule change. Ledger entries snapshot the version they were
 * computed with, so history stays explainable after the rules change
 * (checklist §6 — versioned rule changes).
 */
export interface LoyaltyProgram {
  id: string;
  merchantId: string;
  type: LoyaltyType;
  name: string;
  description: string | null;
  /** Display name for the unit, e.g. "points" or "stamps". */
  unitName: string | null;
  configuration: Record<string, unknown>;
  ruleVersion: number;
  status: ProgramStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const LoyaltyProgramEntity = new EntitySchema<LoyaltyProgram>({
  name: "loyalty_program",
  tableName: "loyalty_program",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    merchantId: { type: "uuid", name: "merchant_id" },
    type: { type: "varchar", length: 20 },
    name: { type: "varchar", length: 200 },
    description: { type: "text", nullable: true },
    unitName: {
      type: "varchar",
      length: 60,
      name: "unit_name",
      nullable: true,
    },
    configuration: { type: "jsonb", default: "{}" },
    ruleVersion: { type: "int", name: "rule_version", default: 1 },
    status: { type: "varchar", length: 20, default: "draft" },
    createdAt: {
      type: "timestamptz",
      name: "created_at",
      default: () => "CURRENT_TIMESTAMP",
    },
    updatedAt: {
      type: "timestamptz",
      name: "updated_at",
      default: () => "CURRENT_TIMESTAMP",
    },
  },
  checks: [
    {
      name: "ck_loyalty_program_type",
      expression: `type IN (${sqlEnum(LOYALTY_TYPES)})`,
    },
    {
      name: "ck_loyalty_program_status",
      expression: `status IN (${sqlEnum(PROGRAM_STATUSES)})`,
    },
    {
      name: "ck_loyalty_program_rule_version",
      expression: "rule_version >= 1",
    },
  ],
  foreignKeys: [
    {
      name: "fk_loyalty_program_merchant",
      target: MerchantEntity,
      columnNames: ["merchant_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
  ],
  indices: [
    { name: "ix_loyalty_program_merchant", columns: ["merchantId"] },
    {
      name: "uq_loyalty_program_active_per_merchant",
      columns: ["merchantId"],
      unique: true,
      where: "status = 'active'",
    },
  ],
});
