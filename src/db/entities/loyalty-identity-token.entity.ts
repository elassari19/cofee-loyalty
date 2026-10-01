import { EntitySchema } from "typeorm";
import {
  IDENTITY_TOKEN_STATUSES,
  sqlEnum,
  type IdentityTokenStatus,
} from "./enums";
import { CustomerProfileEntity } from "./customer-profile.entity";
import { LoyaltyMembershipEntity } from "./loyalty-membership.entity";
import { MerchantEntity } from "./merchant.entity";
import { UserEntity } from "./user.entity";

/**
 * The customer's loyalty identity token (checklist §7 bullet 3): an opaque,
 * revocable 256-bit value that encodes to the QR card the customer shows at
 * the counter, and that staff look a customer up with.
 *
 * Design notes:
 * - **Opaque**: the value carries no name, email, phone or member number —
 *   the QR payload is just the token (src/features/customers/identity.ts),
 *   so a photographed card leaks nothing by itself.
 * - **Revocable**: each row has a status. Rotation issues a new token and
 *   revokes the old one in the same transaction; a partial unique index
 *   guarantees at most one *active* token per membership, so two cards can
 *   never both resolve.
 * - **Stored in the clear** (unlike redemption codes, which are hashed): the
 *   customer must be able to re-open their own card on every visit to `/me`,
 *   which a one-way hash makes impossible. Blast radius is bounded by design:
 *   the token authenticates nothing — resolving it requires an authenticated
 *   staff session (`tokenResolve` rate-limit policy), and it can be revoked
 *   at any time from the customer's security screen.
 * - **Tenant-scoped**: the row denormalises `merchant_id` and joins the
 *   membership, so a token resolved without a tenant context can never leak
 *   across merchants (checklist §7 bullet 7).
 */
export interface LoyaltyIdentityToken {
  id: string;
  merchantId: string;
  customerProfileId: string;
  membershipId: string;
  token: string;
  status: IdentityTokenStatus;
  /** The user the token was issued to — the rotation/audit trail's actor. */
  issuedTo: string | null;
  createdAt: Date;
  revokedAt: Date | null;
  updatedAt: Date;
}

export const LoyaltyIdentityTokenEntity =
  new EntitySchema<LoyaltyIdentityToken>({
    name: "loyalty_identity_token",
    tableName: "loyalty_identity_token",
    columns: {
      id: { type: "uuid", primary: true, generated: "uuid" },
      merchantId: { type: "uuid", name: "merchant_id" },
      customerProfileId: { type: "uuid", name: "customer_profile_id" },
      membershipId: { type: "uuid", name: "membership_id" },
      // base64url of 32 random bytes is 43 chars; leave headroom for v2.
      token: { type: "varchar", length: 128 },
      status: { type: "varchar", length: 20, default: "active" },
      // user.id is varchar(64) (Better Auth), so this FK is varchar too —
      // an entity-level uuid here would make the migration undeployable.
      issuedTo: {
        type: "varchar",
        length: 64,
        name: "issued_to",
        nullable: true,
      },
      createdAt: {
        type: "timestamptz",
        name: "created_at",
        default: () => "CURRENT_TIMESTAMP",
      },
      revokedAt: { type: "timestamptz", name: "revoked_at", nullable: true },
      updatedAt: {
        type: "timestamptz",
        name: "updated_at",
        default: () => "CURRENT_TIMESTAMP",
      },
    },
    uniques: [{ name: "uq_loyalty_identity_token_token", columns: ["token"] }],
    checks: [
      {
        name: "ck_loyalty_identity_token_status",
        expression: `status IN (${sqlEnum(IDENTITY_TOKEN_STATUSES)})`,
      },
      {
        name: "ck_loyalty_identity_token_revoked_at",
        expression: "status = 'active' OR revoked_at IS NOT NULL",
      },
    ],
    foreignKeys: [
      {
        name: "fk_loyalty_identity_token_merchant",
        target: MerchantEntity,
        columnNames: ["merchant_id"],
        referencedColumnNames: ["id"],
        onDelete: "RESTRICT",
      },
      {
        name: "fk_loyalty_identity_token_customer_profile",
        target: CustomerProfileEntity,
        columnNames: ["customer_profile_id"],
        referencedColumnNames: ["id"],
        onDelete: "RESTRICT",
      },
      {
        name: "fk_loyalty_identity_token_membership",
        target: LoyaltyMembershipEntity,
        columnNames: ["membership_id"],
        referencedColumnNames: ["id"],
        onDelete: "RESTRICT",
      },
      {
        name: "fk_loyalty_identity_token_issued_to",
        target: UserEntity,
        columnNames: ["issued_to"],
        referencedColumnNames: ["id"],
        onDelete: "SET NULL",
      },
    ],
    indices: [
      {
        name: "uq_loyalty_identity_token_active_membership",
        columns: ["membershipId"],
        unique: true,
        where: "status = 'active'",
      },
      {
        name: "ix_loyalty_identity_token_merchant_status",
        columns: ["merchantId", "status"],
      },
      {
        name: "ix_loyalty_identity_token_membership",
        columns: ["membershipId"],
      },
    ],
  });
