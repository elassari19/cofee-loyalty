/**
 * Roles and capability permissions (checklist §3 bullet 6, §5, PRD §8).
 *
 * This module is pure data + pure functions: it performs no I/O, reads no
 * request state and is safe to import from server components, client
 * components and tests alike.
 *
 * Authorization is expressed as *capabilities* (what a principal may do) and
 * never as UI state (which links happen to be rendered). Route guards, API
 * guards and navigation all consult the same matrix below, so hiding a nav
 * item and protecting the underlying operation can never drift apart.
 */

export const ROLES = [
  "SUPER_ADMIN",
  "MERCHANT_OWNER",
  "MERCHANT_MANAGER",
  "MERCHANT_STAFF",
  "CUSTOMER",
] as const;

export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  /** Platform-wide administration: merchants, users, subscriptions, settings. */
  "platform.manage",
  /** View merchant/business settings. */
  "merchant.read",
  /** Change merchant/business settings. */
  "merchant.write",
  /** View loyalty program configuration and rules. */
  "loyalty.read",
  /** Change loyalty program configuration and rules. */
  "loyalty.write",
  /** View tenant-scoped customer records (staff: limited field visibility). */
  "customers.read",
  /** Create/edit tenant-scoped customer records. */
  "customers.write",
  /** View tenant-scoped loyalty transactions. */
  "transactions.read",
  /** Create earn/redemption transactions (cashier purchase entry). */
  "transactions.create",
  /** Create manual balance adjustments (owner/manager only). */
  "transactions.adjust",
  /** View rewards. */
  "rewards.read",
  /** Create/edit/activate/deactivate rewards. */
  "rewards.write",
  /** Verify and complete redemptions. */
  "rewards.redeem",
  /** View campaigns. */
  "campaigns.read",
  /** Create/edit/publish/archive campaigns. */
  "campaigns.write",
  /** View the staff roster. */
  "staff.read",
  /** Invite, role-assign, activate/deactivate staff. */
  "staff.manage",
  /** View tenant-scoped analytics. */
  "analytics.read",
  /** View the customer's own profile and membership. */
  "profile.read",
  /** Edit the customer's own profile. */
  "profile.write",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Role → capability matrix (PRD §8).
 *
 * Notes on "Limited"/"Optional" cells in the PRD table:
 * - Staff "limited" customer access is a *field-level* restriction enforced
 *   where customer data is read (§10), not a separate capability.
 * - Staff "limited" analytics stays ungranted: staff keep the transactions
 *   view they need, analytics dashboards remain owner/manager territory.
 * - Manager "optional" staff management is granted; it can be withdrawn by
 *   editing this one row when a merchant wants a stricter manager role.
 * - Customer capabilities only ever resolve against the customer's *own*
 *   membership; tenant scoping happens in the data layer (§5/§7).
 */
const MERCHANT_COMMON: Capability[] = [
  "merchant.read",
  "loyalty.read",
  "loyalty.write",
  "customers.read",
  "customers.write",
  "transactions.read",
  "transactions.create",
  "transactions.adjust",
  "rewards.read",
  "rewards.write",
  "rewards.redeem",
  "campaigns.read",
  "campaigns.write",
  "staff.read",
  "staff.manage",
  "analytics.read",
  "profile.read",
];

export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  SUPER_ADMIN: CAPABILITIES,
  MERCHANT_OWNER: [...MERCHANT_COMMON, "merchant.write"],
  MERCHANT_MANAGER: MERCHANT_COMMON,
  MERCHANT_STAFF: [
    "customers.read",
    "transactions.read",
    "transactions.create",
    "rewards.read",
    "rewards.redeem",
    "profile.read",
  ],
  CUSTOMER: [
    "profile.read",
    "profile.write",
    "loyalty.read",
    "rewards.read",
    "rewards.redeem",
    "transactions.read",
    "campaigns.read",
  ],
};

export function hasCapability(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function hasAllCapabilities(
  role: Role,
  capabilities: readonly Capability[],
): boolean {
  return capabilities.every((capability) => hasCapability(role, capability));
}

export function roleLabel(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Platform administrator";
    case "MERCHANT_OWNER":
      return "Merchant owner";
    case "MERCHANT_MANAGER":
      return "Merchant manager";
    case "MERCHANT_STAFF":
      return "Staff / cashier";
    case "CUSTOMER":
      return "Customer";
  }
}

/** Coarse audience used to pick a route group, shell and navigation set. */
export type Audience = "platform" | "merchant" | "staff" | "customer";

export function audienceForRole(role: Role): Audience {
  switch (role) {
    case "SUPER_ADMIN":
      return "platform";
    case "MERCHANT_OWNER":
    case "MERCHANT_MANAGER":
      return "merchant";
    case "MERCHANT_STAFF":
      return "staff";
    case "CUSTOMER":
      return "customer";
  }
}

/** Landing route for each role — used by guards, sign-in and preview. */
export const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/admin",
  MERCHANT_OWNER: "/dashboard",
  MERCHANT_MANAGER: "/dashboard",
  MERCHANT_STAFF: "/register",
  CUSTOMER: "/me",
};

export function isRole(value: unknown): value is Role {
  return (
    typeof value === "string" && (ROLES as readonly string[]).includes(value)
  );
}
