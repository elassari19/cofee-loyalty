import { EntitySchema } from "typeorm";
import {
  LOYALTY_TYPES,
  REDEMPTION_STATUSES,
  sqlEnum,
  type LoyaltyType,
  type RedemptionStatus,
} from "./enums";
import { LoyaltyMembershipEntity } from "./loyalty-membership.entity";
import { MerchantEntity } from "./merchant.entity";
import { RewardEntity } from "./reward.entity";
import { UserEntity } from "./user.entity";

/**
 * A reward reserved by a customer and verified at the counter (PRD §19/§20,
 * checklist §4).
 *
 * - **The verification code is stored as a SHA-256 hash, never in clear
 *   text** (`code_hash`, UNIQUE). The staff-facing flow hashes the code the
 *   customer shows and looks it up by hash, so a database dump cannot be
 *   replayed as valid codes and guessed codes collide loudly against the
 *   unique index.
 * - **Verify ≠ redeem**: `VERIFIED` records that a human looked at the code;
 *   only `REDEEMED` consumes value. The two states are distinct so checking
 *   a code can never spend it (checklist §9).
 * - `verified_at`/`redeemed_at` are pinned by CHECK constraints to the states
 *   that require them, so the audit trail cannot drift from the status.
 * - The actual balance change is a `REWARD_REDEEMED` ledger entry pointing
 *   back at this row (`loyalty_transaction.redemption_id`); this table
 *   records the who/when, the ledger records the value.
 */
export interface RewardRedemption {
  id: string;
  merchantId: string;
  membershipId: string;
  rewardId: string;
  unit: LoyaltyType;
  /** Value reserved at issue time, in `unit`. */
  cost: number;
  codeHash: string;
  status: RedemptionStatus;
  expiresAt: Date | null;
  requestedBy: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  redeemedBy: string | null;
  redeemedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const RewardRedemptionEntity = new EntitySchema<RewardRedemption>({
  name: "reward_redemption",
  tableName: "reward_redemption",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    merchantId: { type: "uuid", name: "merchant_id" },
    membershipId: { type: "uuid", name: "membership_id" },
    rewardId: { type: "uuid", name: "reward_id" },
    unit: { type: "varchar", length: 10 },
    cost: { type: "int" },
    codeHash: { type: "varchar", length: 64, name: "code_hash" },
    status: { type: "varchar", length: 20, default: "ISSUED" },
    expiresAt: { type: "timestamptz", name: "expires_at", nullable: true },
    requestedBy: {
      type: "varchar",
      length: 64,
      name: "requested_by",
      nullable: true,
    },
    verifiedBy: {
      type: "varchar",
      length: 64,
      name: "verified_by",
      nullable: true,
    },
    verifiedAt: { type: "timestamptz", name: "verified_at", nullable: true },
    redeemedBy: {
      type: "varchar",
      length: 64,
      name: "redeemed_by",
      nullable: true,
    },
    redeemedAt: { type: "timestamptz", name: "redeemed_at", nullable: true },
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
  uniques: [{ name: "uq_reward_redemption_code", columns: ["codeHash"] }],
  checks: [
    { name: "ck_reward_redemption_cost", expression: "cost >= 1" },
    {
      name: "ck_reward_redemption_unit",
      expression: `unit IN (${sqlEnum(LOYALTY_TYPES)})`,
    },
    {
      name: "ck_reward_redemption_status",
      expression: `status IN (${sqlEnum(REDEMPTION_STATUSES)})`,
    },
    {
      name: "ck_reward_redemption_verified_audit",
      expression:
        "status NOT IN ('VERIFIED', 'REDEEMED') OR (verified_at IS NOT NULL AND verified_by IS NOT NULL)",
    },
    {
      name: "ck_reward_redemption_redeemed_audit",
      expression:
        "status <> 'REDEEMED' OR (redeemed_at IS NOT NULL AND redeemed_by IS NOT NULL)",
    },
  ],
  foreignKeys: [
    {
      name: "fk_reward_redemption_merchant",
      target: MerchantEntity,
      columnNames: ["merchant_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
    {
      name: "fk_reward_redemption_membership",
      target: LoyaltyMembershipEntity,
      columnNames: ["membership_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
    {
      name: "fk_reward_redemption_reward",
      target: RewardEntity,
      columnNames: ["reward_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
    {
      name: "fk_reward_redemption_requested_by",
      target: UserEntity,
      columnNames: ["requested_by"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
    {
      name: "fk_reward_redemption_verified_by",
      target: UserEntity,
      columnNames: ["verified_by"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
    {
      name: "fk_reward_redemption_redeemed_by",
      target: UserEntity,
      columnNames: ["redeemed_by"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
  ],
  indices: [
    {
      name: "ix_reward_redemption_tenant_status_created",
      columns: ["merchantId", "status", "createdAt"],
    },
    {
      name: "ix_reward_redemption_merchant_reward",
      columns: ["merchantId", "rewardId"],
    },
    { name: "ix_reward_redemption_membership", columns: ["membershipId"] },
  ],
});
