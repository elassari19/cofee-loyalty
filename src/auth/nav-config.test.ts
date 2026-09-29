import { describe, expect, it } from "vitest";

import { hasCapability, ROLES, type Role } from "@/auth/roles";
import {
  brandForRole,
  navForRole,
  navItemForPath,
} from "@/components/shell/nav-config";

function allItems(role: Role) {
  return navForRole(role).flatMap((section) => section.items);
}

function hrefs(role: Role): string[] {
  return allItems(role).map((item) => item.href);
}

describe("navForRole", () => {
  it("gives the platform admin only /admin destinations", () => {
    const links = hrefs("SUPER_ADMIN");
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      expect(href.startsWith("/admin")).toBe(true);
    }
  });

  it("gives merchant roles the operational console", () => {
    for (const role of ["MERCHANT_OWNER", "MERCHANT_MANAGER"] as const) {
      const links = hrefs(role);
      expect(links).toContain("/dashboard");
      expect(links).toContain("/customers");
      expect(links).toContain("/loyalty");
      expect(links).toContain("/transactions");
      expect(links).toContain("/rewards");
      expect(links).toContain("/campaigns");
      expect(links).toContain("/staff");
      expect(links).toContain("/analytics");
      expect(links).toContain("/settings");
      for (const href of links) {
        expect(href.startsWith("/admin")).toBe(false);
        expect(href.startsWith("/me")).toBe(false);
        expect(href.startsWith("/register")).toBe(false);
      }
    }
  });

  it("keeps manager and owner navigation identical for read surfaces", () => {
    expect(hrefs("MERCHANT_MANAGER").sort()).toEqual(
      hrefs("MERCHANT_OWNER").sort(),
    );
  });

  it("limits staff to the register", () => {
    const links = hrefs("MERCHANT_STAFF");
    expect(links).toEqual([
      "/register",
      "/register/customers",
      "/register/transactions",
      "/register/rewards",
    ]);
    expect(links).not.toContain("/settings");
    expect(links).not.toContain("/analytics");
    expect(links).not.toContain("/staff");
  });

  it("limits customers to their own portal", () => {
    const links = hrefs("CUSTOMER");
    expect(links).toEqual([
      "/me",
      "/me/rewards",
      "/me/activity",
      "/me/offers",
      "/me/profile",
    ]);
  });

  it("only shows items whose capability the role holds", () => {
    for (const role of ROLES) {
      for (const item of allItems(role)) {
        if (item.capability) {
          expect(hasCapability(role, item.capability)).toBe(true);
        }
      }
    }
  });

  it("drops sections that end up empty after filtering", () => {
    const sections = navForRole("MERCHANT_STAFF");
    for (const section of sections) {
      expect(section.items.length).toBeGreaterThan(0);
    }
  });
});

describe("navItemForPath", () => {
  it("resolves the current item with its section title", () => {
    const resolved = navItemForPath("MERCHANT_OWNER", "/rewards");
    expect(resolved).not.toBeNull();
    expect(resolved?.item.href).toBe("/rewards");
    expect(resolved?.section).toBe("Operate");
  });

  it("prefers exact matches for section roots", () => {
    const dashboard = navItemForPath("MERCHANT_OWNER", "/dashboard");
    expect(dashboard?.item.end).toBe(true);

    // /me is a prefix of /me/rewards — exact matching keeps the right one.
    const me = navItemForPath("CUSTOMER", "/me");
    expect(me?.item.href).toBe("/me");
    const meRewards = navItemForPath("CUSTOMER", "/me/rewards");
    expect(meRewards?.item.href).toBe("/me/rewards");
  });

  it("returns null for paths outside the role's navigation", () => {
    expect(navItemForPath("MERCHANT_STAFF", "/settings")).toBeNull();
    expect(navItemForPath("CUSTOMER", "/admin")).toBeNull();
    expect(navItemForPath("SUPER_ADMIN", "/customers")).toBeNull();
    expect(navItemForPath("MERCHANT_OWNER", "/nowhere")).toBeNull();
  });
});

describe("brandForRole", () => {
  it("returns a distinct brand per audience", () => {
    expect(brandForRole("SUPER_ADMIN").name).toBe("Loyalty Platform");
    expect(brandForRole("MERCHANT_OWNER").name).toBe("Merchant console");
    expect(brandForRole("MERCHANT_STAFF").name).toBe("Register");
    expect(brandForRole("CUSTOMER").name).toBe("Loyalty");
    for (const role of ROLES) {
      expect(brandForRole(role).icon).toBeDefined();
    }
  });
});
