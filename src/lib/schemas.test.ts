import { describe, expect, it } from "vitest";

import {
  campaignSchema,
  loyaltySettingsSchema,
  parseInput,
  purchaseSchema,
} from "./schemas";

describe("parseInput", () => {
  it("returns parsed data for valid input", () => {
    const value = parseInput(purchaseSchema, {
      customerId: "cus_maya",
      amount: "9",
    });
    expect(value).toEqual({ customerId: "cus_maya", amount: 9 });
  });

  it("throws the first issue message (used as the operation's result)", () => {
    expect(() =>
      parseInput(purchaseSchema, { customerId: "cus_maya", amount: 0 }),
    ).toThrow("Enter the purchase amount.");
    expect(() =>
      parseInput(purchaseSchema, { customerId: "", amount: "abc" }),
    ).toThrow("Select the customer making the purchase.");
  });

  it("masks nothing: valid parses never throw", () => {
    expect(() =>
      parseInput(purchaseSchema, { customerId: "cus_maya", amount: 42 }),
    ).not.toThrow();
  });
});

describe("loyaltySettingsSchema", () => {
  const valid = {
    programName: "Acme Perks",
    description: "Earn and burn.",
    earnRate: "5",
    welcomeBonus: "100",
    pointsExpiryMonths: "12",
    minPurchase: "1",
  };

  it("coerces form strings into numbers", () => {
    const parsed = loyaltySettingsSchema.parse(valid);
    expect(parsed.earnRate).toBe(5);
    expect(parsed.pointsExpiryMonths).toBe(12);
    expect(parsed.minPurchase).toBe(1);
  });

  it("rejects out-of-range values with field messages", () => {
    const result = loyaltySettingsSchema.safeParse({
      ...valid,
      earnRate: "0",
      pointsExpiryMonths: "0",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain(
        "Earn rate must be at least 0.1 points per currency unit.",
      );
      expect(messages).toContain("Points must expire after at least 1 month.");
    }
  });
});

describe("campaignSchema", () => {
  const valid = {
    name: "Double points Friday",
    audience: "All customers" as const,
    startsOn: "2026-10-01",
    endsOn: "2026-10-15",
    terms: "2× points on Fridays.",
  };

  it("accepts a well-formed campaign", () => {
    expect(campaignSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    const result = campaignSchema.safeParse({
      ...valid,
      startsOn: "2026-10-15",
      endsOn: "2026-10-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["endsOn"]);
      expect(result.error.issues[0]?.message).toBe(
        "The end date can't be before the start date.",
      );
    }
  });

  it("rejects an unknown audience", () => {
    const result = campaignSchema.safeParse({ ...valid, audience: "Everyone" });
    expect(result.success).toBe(false);
  });
});
