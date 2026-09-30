import { EntitySchema } from "typeorm";
import {
  LEDGER_TYPES,
  LOYALTY_TYPES,
  sqlEnum,
  type LedgerType,
  type LoyaltyUnit,
} from "./enums";
import { CustomerProfileEntity } from "./customer-profile.entity";
import { LoyaltyMembershipEntity } from "./loyalty-membership.entity";
import { LoyaltyProgramEntity } from "./loyalty-program.entity";
import { MerchantEntity } from "./merchant.entity";
import { RewardEntity } from "./reward.entity";
import { RewardRedemptionEntity } from "./reward-redemption.entity";
import { UserEntity } from "./user.entity";

/**
 * The immutable loyalty ledger (PRD §13, checklist §4 — "Model points and
 * stamps as immutable ledger entries").
 *
 * Rules of the model:
 *
 * - **Every balance change is exactly one row**, identified by a signed
 *   `delta`. The membership balance is the running total of those deltas,
 *   kept in sync transactionally (see src/db/ledger.ts).
 * - **Rows are never edited or deleted.** A `BEFORE UPDATE OR DELETE` trigger
 *   raises on both `loyalty_transaction` and `audit_log`; mistakes are fixed
 *   with a reversing entry (`*_ADJUSTED`), never by rewriting history.
 *   Reconciliation of bad data is a documented maintenance procedure —
 *   docs/database.md.
 * - **The `type` fixes the sign of `delta`** (earned > 0, redeemed < 0,
 *   adjusted <> 0) and **`unit` fixes the dimension** (`POINTS_*` entries move
 *   `POINTS`, `STAMP_*` entries move `STAMPS`); both are CHECK constraints,
 *   so an application bug cannot write an incoherent entry.
 * - **Tenant ownership is mandatory**: `merchant_id` is NOT NULL, indexed on
 *   every tenant-scoped read path, and must match the membership's tenant —
 *   `appendLedgerEntry` verifies it before inserting.
 * - **Idempotency**: `UNIQUE (merchant_id, idempotency_key)` collapses
 *   duplicate cashier submissions; `UNIQUE (merchant_id, external_ref)` does
 *   the same for future POS imports (checklist §12).
 * - **Rule context is frozen**: `program_id` + `rule_version` record the
 *   configuration the amount was calculated with.
 *
 * There is deliberately no `updated_at` here — the row is written once.
 */
export interface LoyaltyTransaction {
  id: string;
  merchantId: string;
  membershipId: string;
  customerProfileId: string;
  programId: string | null;
  ruleVersion: number | null;
  type: LedgerType;
  unit: LoyaltyUnit;
  /** Signed change applied to the membership balance. */
  delta: number;
  /** Purchase amount the award was calculated from, when there was one. */
  purchaseAmount: number | null;
  currency: string | null;
  /** Required for manual adjustments — why a human changed the balance. */
  reason: string | null;
  rewardId: string | null;
  redemptionId: string | null;
  /** The user (staff/owner/admin) responsible for the entry. */
  createdBy: string | null;
  /** Caller-supplied key that makes retried submissions apply exactly once. */
  idempotencyKey: string | null;
  /** External system reference (POS import), unique per merchant. */
  externalRef: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export const LoyaltyTransactionEntity = new EntitySchema<LoyaltyTransaction>({
  name: "loyalty_transaction",
  tableName: "loyalty_transaction",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    merchantId: { type: "uuid", name: "merchant_id" },
    membershipId: { type: "uuid", name: "membership_id" },
    customerProfileId: { type: "uuid", name: "customer_profile_id" },
    programId: { type: "uuid", name: "program_id", nullable: true },
    ruleVersion: { type: "int", name: "rule_version", nullable: true },
    type: { type: "varchar", length: 30 },
    unit: { type: "varchar", length: 10 },
    delta: { type: "int" },
    purchaseAmount: {
      type: "numeric",
      name: "purchase_amount",
      precision: 12,
      scale: 2,
      nullable: true,
    },
    currency: { type: "varchar", length: 3, nullable: true },
    reason: { type: "varchar", length: 200, nullable: true },
    rewardId: { type: "uuid", name: "reward_id", nullable: true },
    redemptionId: { type: "uuid", name: "redemption_id", nullable: true },
    createdBy: {
      type: "varchar",
      length: 64,
      name: "created_by",
      nullable: true,
    },
    idempotencyKey: {
      type: "varchar",
      length: 120,
      name: "idempotency_key",
      nullable: true,
    },
    externalRef: {
      type: "varchar",
      length: 120,
      name: "external_ref",
      nullable: true,
    },
    metadata: { type: "jsonb", default: "{}" },
    createdAt: {
      type: "timestamptz",
      name: "created_at",
      default: () => "CURRENT_TIMESTAMP",
    },
  },
  uniques: [
    {
      name: "uq_loyalty_transaction_idempotency",
      columns: ["merchantId", "idempotencyKey"],
    },
    {
      name: "uq_loyalty_transaction_external_ref",
      columns: ["merchantId", "externalRef"],
    },
  ],
  checks: [
    {
      name: "ck_loyalty_transaction_type",
      expression: `type IN (${sqlEnum(LEDGER_TYPES)})`,
    },
    {
      name: "ck_loyalty_transaction_unit",
      expression: `unit IN (${sqlEnum(LOYALTY_TYPES)})`,
    },
    {
      name: "ck_loyalty_transaction_type_unit",
      expression:
        "(type IN ('POINTS_EARNED', 'POINTS_ADJUSTED', 'POINTS_REDEEMED') AND unit = 'POINTS') OR " +
        "(type IN ('STAMP_EARNED', 'STAMP_ADJUSTED', 'STAMP_REDEEMED') AND unit = 'STAMPS') OR " +
        "(type = 'REWARD_REDEEMED' AND unit IN ('POINTS', 'STAMPS'))",
    },
    {
      name: "ck_loyalty_transaction_delta_sign",
      expression:
        "(type IN ('POINTS_EARNED', 'STAMP_EARNED') AND delta > 0) OR " +
        "(type IN ('POINTS_REDEEMED', 'STAMP_REDEEMED') AND delta < 0) OR " +
        "(type IN ('POINTS_ADJUSTED', 'STAMP_ADJUSTED') AND delta <> 0) OR " +
        "(type = 'REWARD_REDEEMED' AND delta < 0)",
    },
    {
      name: "ck_loyalty_transaction_purchase_amount",
      expression: "purchase_amount IS NULL OR purchase_amount > 0",
    },
    {
      name: "ck_loyalty_transaction_adjustment_reason",
      expression:
        "type NOT IN ('POINTS_ADJUSTED', 'STAMP_ADJUSTED') OR length(btrim(reason)) > 0",
    },
    {
      name: "ck_loyalty_transaction_currency",
      expression: "currency IS NULL OR currency ~ '^[A-Z]{3}$'",
    },
  ],
  foreignKeys: [
    {
      name: "fk_loyalty_transaction_merchant",
      target: MerchantEntity,
      columnNames: ["merchant_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
    {
      name: "fk_loyalty_transaction_membership",
      target: LoyaltyMembershipEntity,
      columnNames: ["membership_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
    {
      name: "fk_loyalty_transaction_customer_profile",
      target: CustomerProfileEntity,
      columnNames: ["customer_profile_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
    {
      name: "fk_loyalty_transaction_program",
      target: LoyaltyProgramEntity,
      columnNames: ["program_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
    {
      name: "fk_loyalty_transaction_reward",
      target: RewardEntity,
      columnNames: ["reward_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
    {
      name: "fk_loyalty_transaction_redemption",
      target: RewardRedemptionEntity,
      columnNames: ["redemption_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
    {
      name: "fk_loyalty_transaction_created_by",
      target: UserEntity,
      columnNames: ["created_by"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
  ],
  indices: [
    {
      name: "ix_loyalty_transaction_membership_created",
      columns: ["membershipId", "createdAt"],
    },
    {
      name: "ix_loyalty_transaction_tenant_customer_created",
      columns: ["merchantId", "customerProfileId", "createdAt"],
    },
    {
      name: "ix_loyalty_transaction_tenant_created",
      columns: ["merchantId", "createdAt"],
    },
    { name: "ix_loyalty_transaction_redemption", columns: ["redemptionId"] },
  ],
});
