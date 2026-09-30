import { EntitySchema } from "typeorm";
import {
  LOYALTY_MEMBERSHIP_STATUSES,
  sqlEnum,
  type LoyaltyMembershipStatus,
} from "./enums";
import { CustomerProfileEntity } from "./customer-profile.entity";
import { MerchantEntity } from "./merchant.entity";

/**
 * A customer's membership in one merchant's loyalty program: the row that
 * carries the *balance* (checklist §4 — balance strategy).
 *
 * - `balance` is a **projection**: it is updated in the same database
 *   transaction that appends the ledger entry, while holding a
 *   `SELECT ... FOR UPDATE` lock on this row (src/db/ledger.ts). It is never
 *   written outside that path, and integration tests reconcile it against
 *   `SUM(loyalty_transaction.delta)` on every run.
 * - `UNIQUE (merchant_id, customer_profile_id)` gives one membership per
 *   customer per merchant — repeated QR scans and concurrent joins collapse
 *   into a single row.
 * - `CHECK (balance >= 0)` means value can never be conjured: redemptions
 *   validate before they deduct, and the database refuses the rest.
 */
export interface LoyaltyMembership {
  id: string;
  merchantId: string;
  customerProfileId: string;
  balance: number;
  status: LoyaltyMembershipStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const LoyaltyMembershipEntity = new EntitySchema<LoyaltyMembership>({
  name: "loyalty_membership",
  tableName: "loyalty_membership",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    merchantId: { type: "uuid", name: "merchant_id" },
    customerProfileId: { type: "uuid", name: "customer_profile_id" },
    balance: { type: "int", default: 0 },
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
      name: "uq_loyalty_membership_merchant_customer",
      columns: ["merchantId", "customerProfileId"],
    },
  ],
  checks: [
    { name: "ck_loyalty_membership_balance", expression: "balance >= 0" },
    {
      name: "ck_loyalty_membership_status",
      expression: `status IN (${sqlEnum(LOYALTY_MEMBERSHIP_STATUSES)})`,
    },
  ],
  foreignKeys: [
    {
      name: "fk_loyalty_membership_merchant",
      target: MerchantEntity,
      columnNames: ["merchant_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
    {
      name: "fk_loyalty_membership_customer_profile",
      target: CustomerProfileEntity,
      columnNames: ["customer_profile_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
  ],
  indices: [
    { name: "ix_loyalty_membership_customer", columns: ["customerProfileId"] },
    {
      name: "ix_loyalty_membership_merchant_status",
      columns: ["merchantId", "status"],
    },
  ],
});
