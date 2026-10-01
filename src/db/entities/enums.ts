/**
 * Closed value domains for every stateful column (checklist §4 — "Add database
 * constraints for ... valid enum/state values").
 *
 * Each list below is the single TypeScript source of truth and is inlined into
 * the entity's `CHECK` constraint through `sqlEnum()`, so an entity can never
 * accept a value the database rejects (and vice versa: the migration ships the
 * same expression).
 *
 * These are plain varchar + CHECK columns rather than PostgreSQL `ENUM` types
 * so that adding a value is an ordinary reviewed migration, not a `ALTER TYPE`
 * that cannot run inside a transaction block.
 */

/** Renders a list as SQL literals: `('A', 'B')`. */
export function sqlEnum(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(", ");
}

/**
 * Platform-wide role of a user (PRD §8). The *tenant* roles
 * (`MERCHANT_OWNER` / `MERCHANT_MANAGER` / `MERCHANT_STAFF`) live on
 * `merchant_membership`, never on the user, so one identity can hold a
 * different role in every merchant it belongs to.
 */
export const USER_ROLES = ["SUPER_ADMIN", "MERCHANT", "CUSTOMER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["active", "invited", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const MERCHANT_STATUSES = ["trial", "active", "suspended"] as const;
export type MerchantStatus = (typeof MERCHANT_STATUSES)[number];

export const MERCHANT_MEMBERSHIP_ROLES = [
  "MERCHANT_OWNER",
  "MERCHANT_MANAGER",
  "MERCHANT_STAFF",
] as const;
export type MerchantMembershipRole = (typeof MERCHANT_MEMBERSHIP_ROLES)[number];

export const MERCHANT_MEMBERSHIP_STATUSES = [
  "active",
  "invited",
  "disabled",
] as const;
export type MerchantMembershipStatus =
  (typeof MERCHANT_MEMBERSHIP_STATUSES)[number];

export const LOYALTY_TYPES = ["POINTS", "STAMPS"] as const;
export type LoyaltyType = (typeof LOYALTY_TYPES)[number];

/** The value unit a ledger entry moves — always the program's loyalty type. */
export type LoyaltyUnit = LoyaltyType;

export const PROGRAM_STATUSES = ["draft", "active", "archived"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const LOYALTY_MEMBERSHIP_STATUSES = ["active", "closed"] as const;
export type LoyaltyMembershipStatus =
  (typeof LOYALTY_MEMBERSHIP_STATUSES)[number];

/**
 * Immutable ledger entry types (PRD §13). Signs of `delta` are enforced by a
 * CHECK constraint: earned > 0, redeemed < 0, adjusted <> 0.
 */
export const LEDGER_TYPES = [
  "POINTS_EARNED",
  "POINTS_ADJUSTED",
  "POINTS_REDEEMED",
  "STAMP_EARNED",
  "STAMP_ADJUSTED",
  "STAMP_REDEEMED",
  "REWARD_REDEEMED",
] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

/**
 * Lifecycle of a row in the transactional outbox (checklist §8 bullet 12).
 * A row is written in the *same* transaction as the change it describes, then
 * a dispatcher claims it, delivers it and moves it to `DELIVERED` — or back to
 * `PENDING` with a later `available_at` (and eventually `FAILED`) when a
 * handler throws.
 */
export const DOMAIN_EVENT_STATUSES = [
  "PENDING",
  "DELIVERED",
  "FAILED",
] as const;
export type DomainEventStatus = (typeof DOMAIN_EVENT_STATUSES)[number];

/**
 * Lifecycle of the opaque loyalty identity token a customer's QR card encodes
 * (checklist §7 — "an opaque, revocable identifier"). One *active* token per
 * membership (partial unique index); rotating the card revokes the old row
 * instead of deleting it, so history of what was scanned stays intact.
 */
export const IDENTITY_TOKEN_STATUSES = ["active", "revoked"] as const;
export type IdentityTokenStatus = (typeof IDENTITY_TOKEN_STATUSES)[number];

export const REWARD_STATUSES = ["active", "inactive"] as const;
export type RewardStatus = (typeof REWARD_STATUSES)[number];

/**
 * Redemption lifecycle: the customer `ISSUED` a code, staff `VERIFIED` it
 * (a read-only check that must not consume value), then completed it
 * (`REDEEMED`).
 */
export const REDEMPTION_STATUSES = [
  "ISSUED",
  "VERIFIED",
  "REDEEMED",
  "EXPIRED",
  "CANCELLED",
] as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];

export const CAMPAIGN_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "ACTIVE",
  "ENDED",
  "ARCHIVED",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_AUDIENCES = ["ALL_CUSTOMERS"] as const;
export type CampaignAudience = (typeof CAMPAIGN_AUDIENCES)[number];

export const SUBSCRIPTION_PLANS = [
  "FREE",
  "STARTER",
  "PRO",
  "BUSINESS",
] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "cancelled",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Which canonical entity a provider identifier belongs to. Provider ids are
 * never the platform's own identity (checklist §12); they only ever point at
 * one of these records through `integration_record`.
 */
export const INTEGRATION_ENTITY_TYPES = [
  "merchant",
  "customer_profile",
  "loyalty_membership",
] as const;
export type IntegrationEntityType = (typeof INTEGRATION_ENTITY_TYPES)[number];
