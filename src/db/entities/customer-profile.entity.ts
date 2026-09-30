import { EntitySchema } from "typeorm";
import { UserEntity } from "./user.entity";

/**
 * Customer-facing profile attached to a platform identity (PRD §15).
 *
 * A `user` may have at most one `customer_profile`, but that profile joins
 * any number of merchants through `loyalty_membership`. This is what keeps
 * "one customer identity, many merchants" true in the schema instead of by
 * convention.
 *
 * Contact data (name/phone) lives here — on the profile, not on the
 * membership — so a customer keeps one identity while each merchant sees it
 * through its own membership row.
 */
export interface CustomerProfile {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const CustomerProfileEntity = new EntitySchema<CustomerProfile>({
  name: "customer_profile",
  tableName: "customer_profile",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    userId: { type: "varchar", length: 64, name: "user_id" },
    name: { type: "varchar", length: 200 },
    phone: { type: "varchar", length: 40, nullable: true },
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
  uniques: [{ name: "uq_customer_profile_user", columns: ["userId"] }],
  foreignKeys: [
    {
      name: "fk_customer_profile_user",
      target: UserEntity,
      columnNames: ["user_id"],
      referencedColumnNames: ["id"],
      onDelete: "RESTRICT",
    },
  ],
  indices: [{ name: "ix_customer_profile_name", columns: ["name"] }],
});
