import { describe, expect, it } from "vitest";

import {
  emptyRewardFormValues,
  rewardFormSchema,
  type RewardFormValues,
} from "./schemas";

function validReward(
  overrides: Record<string, unknown> = {},
): RewardFormValues {
  return {
    ...emptyRewardFormValues(),
    name: "Free pastry",
    ...overrides,
  } as RewardFormValues;
}

describe("rewardFormSchema", () => {
  it("accepts a complete reward", () => {
    const parsed = rewardFormSchema.parse(
      validReward({
        description: "Any single pastry.",
        expiresAt: "2026-12-31",
        redemptionLimit: 25,
        terms: "One per customer per month.",
      }),
    );
    expect(parsed.cost).toBe(100);
    expect(parsed.redemptionLimit).toBe(25);
  });

  it("maps blank optional fields to null", () => {
    const parsed = rewardFormSchema.parse(
      validReward({ expiresAt: "", redemptionLimit: "" }),
    );
    expect(parsed.redemptionLimit).toBeNull();
    expect(parsed.expiresAt).toBe("");
  });

  it("rejects impossible costs and limits", () => {
    for (const overrides of [
      { cost: 0 },
      { cost: "many" },
      { redemptionLimit: 0 },
      { redemptionLimit: -5 },
    ]) {
      expect(rewardFormSchema.safeParse(validReward(overrides)).success).toBe(
        false,
      );
    }
  });

  it("requires a name and a machine-readable date", () => {
    expect(rewardFormSchema.safeParse(validReward({ name: "x" })).success).toBe(
      false,
    );
    expect(
      rewardFormSchema.safeParse(validReward({ expiresAt: "31-12-2026" }))
        .success,
    ).toBe(false);
  });

  it("never carries a unit — the server derives it from the program", () => {
    const parsed = rewardFormSchema.parse(validReward());
    expect(parsed).not.toHaveProperty("unit");
  });
});
