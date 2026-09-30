import { EntitySchema } from "typeorm";
import {
  USER_ROLES,
  USER_STATUSES,
  sqlEnum,
  type UserRole,
  type UserStatus,
} from "./enums";

/**
 * Platform user identity — one row per person/account, independent of any
 * merchant (checklist §4 — "Keep platform user identity separate from
 * merchant-specific membership").
 *
 * - `id` is a `varchar(64)` because Better Auth generates its own opaque
 *   string ids; the auth layer maps its `user` model onto this table
 *   (ADR 0001, see docs/database.md § "Authentication tables").
 * - `role` is the *platform* role used for routing and coarse authorization.
 *   Merchant-scoped roles live on `merchant_membership`, so one identity can
 *   be an owner in one merchant and a customer in another.
 * - Emails are normalized to lowercase before insert; `uq_user_email` makes
 *   the uniqueness constraint the database, not the application, the last
 *   word.
 */
export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export const UserEntity = new EntitySchema<User>({
  name: "user",
  tableName: "user",
  columns: {
    id: { type: "varchar", length: 64, primary: true },
    name: { type: "varchar", length: 200 },
    email: { type: "varchar", length: 320 },
    emailVerified: { type: "boolean", name: "email_verified", default: false },
    image: { type: "varchar", length: 500, nullable: true },
    role: { type: "varchar", length: 30, default: "CUSTOMER" },
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
  uniques: [{ name: "uq_user_email", columns: ["email"] }],
  checks: [
    { name: "ck_user_role", expression: `role IN (${sqlEnum(USER_ROLES)})` },
    {
      name: "ck_user_status",
      expression: `status IN (${sqlEnum(USER_STATUSES)})`,
    },
  ],
});
