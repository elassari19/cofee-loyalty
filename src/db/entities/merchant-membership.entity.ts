import { EntitySchema } from "typeorm";
import {
  MERCHANT_MEMBERSHIP_ROLES,
  MERCHANT_MEMBERSHIP_STATUSES,
  sqlEnum,
  type MerchantMembershipRole,
  type MerchantMembershipStatus,
} from "./enums";
import { MerchantEntity } from "./merchant.entity";
import { UserEntity } from "./user.entity";

/**
 * The join between a platform identity and a tenant (checklist §4 — "Keep
 * platform user identity separate from merchant-specific membership").
 *
 * - The tenant role lives *here*, not on `user`: the same person can be an
 *   owner in one merchant, a cashier in another, and a plain customer
 *   everywhere else.
 * - `UNIQUE (merchant_id, user_id)` makes duplicate membership impossible at
 *   the database level — repeated invitations or concurrent joins collapse
 *   into one row.
 */
export interface MerchantMembership {
  id: string;
  merchantId: string;
  userId: string;
  role: MerchantMembershipRole;
  status: MerchantMembershipStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const MerchantMembershipEntity = new EntitySchema<MerchantMembership>({
  name: "merchant_membership",
  tableName: "merchant_membership",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    merchantId: { type: "uuid", name: "merchant_id" },
    userId: { type: "varchar", length: 64, name: "user_id" },
    role: { type: "varchar", length: 30 },
    status: { type: "varchar", length: 20, default: "active" },
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
  uniques: [
    {
      name: "uq_merchant_membership_merchant_user",
      columns: ["merchantId", "userId"],
    },
  ],
  checks: [
    {
      name: "ck_merchant_membership_role",
      expression: `role IN (${sqlEnum(MERCHANT_MEMBERSHIP_ROLES)})`,
    },
    {
      name: "ck_merchant_membership_status",
      expression: `status IN (${sqlEnum(MERCHANT_MEMBERSHIP_STATUSES)})`,
    },
  ],
  foreignKeys: [
    {
      name: "fk_merchant_membership_merchant",
      target: MerchantEntity,
      columnNames: ["merchant_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
    {
      name: "fk_merchant_membership_user",
      target: UserEntity,
      columnNames: ["user_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
  ],
  indices: [
    { name: "ix_merchant_membership_user", columns: ["userId"] },
    {
      name: "ix_merchant_membership_merchant_status",
      columns: ["merchantId", "status"],
    },
  ],
});
