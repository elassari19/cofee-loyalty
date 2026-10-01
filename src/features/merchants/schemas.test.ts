import { describe, expect, it } from "vitest";

import {
  businessProfileSchema,
  businessProfileValues,
  emptyBusinessProfileValues,
  isProfileComplete,
  slugify,
  type BusinessProfileValues,
} from "./schemas";

function validProfile(): BusinessProfileValues {
  return {
    ...emptyBusinessProfileValues(),
    name: "Café Zéro",
    email: "hello@cafe-zero.example",
    address: "1 Test Street, Testville",
  };
}

describe("businessProfileSchema", () => {
  it("accepts a complete profile", () => {
    expect(businessProfileSchema.safeParse(validProfile()).success).toBe(true);
  });

  it("rejects incomplete or malformed contact details", () => {
    const base = validProfile();
    const cases: Array<[string, BusinessProfileValues]> = [
      ["invalid email", { ...base, email: "not-an-email" }],
      ["too-short name", { ...base, name: "x" }],
      ["missing address", { ...base, address: "" }],
      ["malformed timezone", { ...base, timezone: "Europe Berlin" }],
      ["lowercase currency", { ...base, currency: "eur" }],
      ["truncated currency", { ...base, currency: "EURO" }],
    ];
    for (const [label, value] of cases) {
      expect(businessProfileSchema.safeParse(value).success, label).toBe(false);
    }
  });
});

describe("isProfileComplete", () => {
  it("passes when every required field is present", () => {
    expect(isProfileComplete(validProfile())).toBe(true);
  });

  it("fails while any required field is blank or whitespace", () => {
    const base = validProfile();
    expect(isProfileComplete({ ...base, email: "" })).toBe(false);
    expect(isProfileComplete({ ...base, address: "  " })).toBe(false);
    expect(isProfileComplete({ ...base, category: null })).toBe(false);
    expect(isProfileComplete({ ...base, name: " " })).toBe(false);
  });

  it("ignores optional fields", () => {
    const base = validProfile();
    const withOptionals: BusinessProfileValues = {
      ...base,
      phone: "",
      website: "",
      description: "",
    };
    expect(isProfileComplete(withOptionals)).toBe(true);
  });
});

describe("businessProfileValues", () => {
  it("maps a stored row into form defaults", () => {
    const values = businessProfileValues({
      name: "Roast & Co",
      category: "coffee",
      description: null,
      email: "hi@roast.example",
      phone: null,
      website: null,
      address: "2 Roast Lane",
      currency: "EUR",
      timezone: "UTC",
      logoUrl: null,
    });
    expect(values).toEqual({
      name: "Roast & Co",
      category: "coffee",
      description: "",
      email: "hi@roast.example",
      phone: "",
      website: "",
      address: "2 Roast Lane",
      currency: "EUR",
      timezone: "UTC",
      logoUrl: "",
    });
  });

  it("falls back to a representable category for unknown legacy values", () => {
    const values = businessProfileValues({
      name: "Old Truck",
      category: "food-truck",
      description: null,
      email: "old@truck.example",
      phone: null,
      website: null,
      address: "3 Wheels Road",
      currency: "EUR",
      timezone: "UTC",
      logoUrl: null,
    });
    expect(values.category).toBe("other");
  });
});

describe("slugify", () => {
  it("folds accents and punctuation into a stable join slug", () => {
    expect(slugify("Café Zéro")).toBe("cafe-zero");
    expect(slugify("  Hello, World!!  ")).toBe("hello-world");
    expect(slugify("Roast & Co")).toBe("roast-co");
  });

  it("always produces something usable", () => {
    expect(slugify("???")).toBe("business");
    const long = slugify("x".repeat(200));
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("-")).toBe(false);
  });
});
