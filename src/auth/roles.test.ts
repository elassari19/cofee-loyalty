import { describe, expect, it } from "vitest";

import {
  CAPABILITIES,
  ROLES,
  ROLE_CAPABILITIES,
  ROLE_HOME,
  audienceForRole,
  hasAllCapabilities,
  hasCapability,
  isRole,
  roleLabel,
  type Capability,
  type Role,
} from "./roles";

describe("role capability matrix (PRD §8)", () => {
  it("grants platform management only to the super admin", () => {
    expect(hasCapability("SUPER_ADMIN", "platform.manage")).toBe(true);
    for (const role of ROLES.filter((r) => r !== "SUPER_ADMIN")) {
      expect(hasCapability(role, "platform.manage")).toBe(false);
    }
  });

  it("lets owners but not managers change business settings", () => {
    expect(hasCapability("MERCHANT_OWNER", "merchant.write")).toBe(true);
    expect(hasCapability("MERCHANT_MANAGER", "merchant.write")).toBe(false);
    expect(hasCapability("MERCHANT_MANAGER", "merchant.read")).toBe(true);
  });

  it("keeps loyalty, rewards, campaigns and staff management away from staff", () => {
    const staff: Role = "MERCHANT_STAFF";
    const denied: Capability[] = [
      "loyalty.write",
      "rewards.write",
      "campaigns.read",
      "campaigns.write",
      "staff.manage",
      "staff.read",
      "analytics.read",
      "transactions.adjust",
      "customers.write",
      "merchant.write",
    ];
    for (const capability of denied) {
      expect(hasCapability(staff, capability)).toBe(false);
    }
  });

  it("gives staff exactly what a cashier needs to operate", () => {
    const staff: Role = "MERCHANT_STAFF";
    const granted: Capability[] = [
      "customers.read",
      "transactions.read",
      "transactions.create",
      "rewards.read",
      "rewards.redeem",
    ];
    for (const capability of granted) {
      expect(hasCapability(staff, capability)).toBe(true);
    }
  });

  it("limits customers to their own data", () => {
    const customer: Role = "CUSTOMER";
    const granted: Capability[] = [
      "profile.read",
      "profile.write",
      "loyalty.read",
      "rewards.read",
      "rewards.redeem",
      "transactions.read",
      "campaigns.read",
    ];
    for (const capability of granted) {
      expect(hasCapability(customer, capability)).toBe(true);
    }
    const denied: Capability[] = [
      "customers.read",
      "customers.write",
      "transactions.create",
      "transactions.adjust",
      "staff.manage",
      "merchant.read",
      "loyalty.write",
      "analytics.read",
    ];
    for (const capability of denied) {
      expect(hasCapability(customer, capability)).toBe(false);
    }
  });

  it("never grants a capability outside the published capability list", () => {
    const known = new Set<string>(CAPABILITIES);
    for (const role of ROLES) {
      for (const capability of ROLE_CAPABILITIES[role]) {
        expect(known.has(capability)).toBe(true);
      }
    }
  });

  it("checks every required capability, not just the first", () => {
    expect(
      hasAllCapabilities("MERCHANT_STAFF", [
        "transactions.create",
        "staff.manage",
      ]),
    ).toBe(false);
    expect(
      hasAllCapabilities("MERCHANT_STAFF", [
        "transactions.create",
        "rewards.redeem",
      ]),
    ).toBe(true);
  });
});

describe("role metadata", () => {
  it("maps every role to an audience and a home route", () => {
    expect(audienceForRole("SUPER_ADMIN")).toBe("platform");
    expect(audienceForRole("MERCHANT_OWNER")).toBe("merchant");
    expect(audienceForRole("MERCHANT_MANAGER")).toBe("merchant");
    expect(audienceForRole("MERCHANT_STAFF")).toBe("staff");
    expect(audienceForRole("CUSTOMER")).toBe("customer");

    for (const role of ROLES) {
      expect(ROLE_HOME[role]).toMatch(/^\//);
    }
  });

  it("labels roles for display and guards unknown values", () => {
    expect(roleLabel("MERCHANT_STAFF")).toBe("Staff / cashier");
    expect(isRole("MERCHANT_STAFF")).toBe(true);
    expect(isRole("nope")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
