import { EntitySchema } from "typeorm";
import { MERCHANT_STATUSES, sqlEnum, type MerchantStatus } from "./enums";

/**
 * A merchant is a *tenant* (PRD §6): the boundary every other tenant-owned
 * record hangs off. `merchant_id` is therefore present — NOT NULL and
 * indexed — on every merchant-owned table in this schema.
 *
 * Merchants are suspended, never deleted: the foreign keys of every
 * tenant-owned table use `ON DELETE RESTRICT`, so a tenant with history
 * cannot disappear from under its ledger.
 */
export interface Merchant {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  category: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  currency: string;
  timezone: string;
  status: MerchantStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const MerchantEntity = new EntitySchema<Merchant>({
  name: "merchant",
  tableName: "merchant",
  columns: {
    id: { type: "uuid", primary: true, generated: "uuid" },
    name: { type: "varchar", length: 200 },
    slug: { type: "varchar", length: 100 },
    logoUrl: { type: "varchar", length: 500, name: "logo_url", nullable: true },
    description: { type: "text", nullable: true },
    category: { type: "varchar", length: 80, nullable: true },
    address: { type: "text", nullable: true },
    phone: { type: "varchar", length: 40, nullable: true },
    email: { type: "varchar", length: 320, nullable: true },
    website: { type: "varchar", length: 500, nullable: true },
    currency: { type: "varchar", length: 3, default: "EUR" },
    timezone: { type: "varchar", length: 64, default: "UTC" },
    status: { type: "varchar", length: 20, default: "trial" },
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
  uniques: [{ name: "uq_merchant_slug", columns: ["slug"] }],
  checks: [
    {
      name: "ck_merchant_status",
      expression: `status IN (${sqlEnum(MERCHANT_STATUSES)})`,
    },
    {
      name: "ck_merchant_currency",
      expression: "currency ~ '^[A-Z]{3}$'",
    },
    {
      name: "ck_merchant_timezone",
      expression: "length(btrim(timezone)) > 0",
    },
  ],
  indices: [
    { name: "ix_merchant_status", columns: ["status"] },
    { name: "ix_merchant_created_at", columns: ["createdAt"] },
  ],
});
