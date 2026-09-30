import { EntitySchema } from "typeorm";
import {
  LOYALTY_TYPES,
  REWARD_STATUSES,
  sqlEnum,
  type LoyaltyType,
  type RewardStatus,
} from "./enums";
import { MerchantEntity } from "./merchant.entity";

/**
 * A redeemable benefit a merchant offers (PRD §18).
 *
 * `unit` is fixed per reward so a points program and a stamp card cannot
 * accidentally share a reward. `redemption_count` is a projection maintained
 * by the redemption service in the same transaction as the redemption
 * itself; the CHECK constraints keep the counter sane (`>= 0`, and never
 * above `redemption_limit` when one exists).
 */
export interface Reward {
  id: string;
  merchantId: string;
  name: string;
  description: string | null;
  terms: string | null;
  imageUrl: string | null;
  /** Cost in `unit` — always at least 1: free items are not redemptions. */
  cost: number;
  unit: LoyaltyType;
  status: RewardStatus;
  expiresAt: Date | null;
  /** `null` = unlimited. */
  redemptionLimit: number | null;
  redemptionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export const RewardEntity = new EntitySchema<Reward>({
  name: "reward",
  tableName: "reward",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    merchantId: { type: "uuid", name: "merchant_id" },
    name: { type: "varchar", length: 200 },
    description: { type: "text", nullable: true },
    terms: { type: "text", nullable: true },
    imageUrl: {
      type: "varchar",
      length: 500,
      name: "image_url",
      nullable: true,
    },
    cost: { type: "int" },
    unit: { type: "varchar", length: 10 },
    status: { type: "varchar", length: 20, default: "active" },
    expiresAt: { type: "timestamptz", name: "expires_at", nullable: true },
    redemptionLimit: {
      type: "int",
      name: "redemption_limit",
      nullable: true,
    },
    redemptionCount: { type: "int", name: "redemption_count", default: 0 },
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
    { name: "ck_reward_cost", expression: "cost >= 1" },
    {
      name: "ck_reward_unit",
      expression: `unit IN (${sqlEnum(LOYALTY_TYPES)})`,
    },
    {
      name: "ck_reward_status",
      expression: `status IN (${sqlEnum(REWARD_STATUSES)})`,
    },
    {
      name: "ck_reward_redemption_limit",
      expression: "redemption_limit IS NULL OR redemption_limit >= 1",
    },
    { name: "ck_reward_redemption_count", expression: "redemption_count >= 0" },
    {
      name: "ck_reward_redemption_count_within_limit",
      expression:
        "redemption_limit IS NULL OR redemption_count <= redemption_limit",
    },
  ],
  foreignKeys: [
    {
      name: "fk_reward_merchant",
      target: MerchantEntity,
      columnNames: ["merchant_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
  ],
  indices: [
    { name: "ix_reward_merchant_status", columns: ["merchantId", "status"] },
    {
      name: "ix_reward_merchant_created",
      columns: ["merchantId", "createdAt"],
    },
  ],
});
