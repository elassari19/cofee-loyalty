import { describe, expect, it } from "vitest";

import { ACTIVE_MERCHANT_COOKIE } from "@/auth/session";

import { activeMerchantCookieEntry, safeNextPath } from "./flows";

/**
 * Redirect and cookie helpers used by the sign-in/tenant flows — the two
 * places where a value that came from the outside must not be trusted.
 */

describe("safeNextPath", () => {
  it("keeps same-site absolute paths", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/me?tab=points")).toBe("/me?tab=points");
    expect(safeNextPath("/rewards/new")).toBe("/rewards/new");
  });

  it("drops anything that could leave the site", () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath("dashboard")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
    expect(safeNextPath("/path\nLocation: https://evil.example")).toBeNull();
  });
});

describe("activeMerchantCookieEntry", () => {
  it("describes the tenant cookie with its attributes", () => {
    const entry = activeMerchantCookieEntry(
      "e1111111-0000-4000-8000-000000000001",
    );
    const [pair, ...attributes] = entry.split(";");
    expect(pair).toBe(
      `${ACTIVE_MERCHANT_COOKIE}=e1111111-0000-4000-8000-000000000001`,
    );

    const normalized = attributes.map((attribute) =>
      attribute.trim().toLowerCase(),
    );
    expect(normalized).toContain("path=/");
    expect(normalized).toContain("httponly");
    expect(normalized).toContain("samesite=lax");
    expect(
      normalized.some((attribute) => attribute.startsWith("max-age=")),
    ).toBe(true);
    // Only production traffic is served over https.
    expect(normalized).not.toContain("secure");
  });
});
