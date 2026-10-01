import { describe, expect, it } from "vitest";

import {
  emptyProgramFormValues,
  isConfigurationValid,
  isSameConfiguration,
  programFormSchema,
  programFormValues,
  summarizeProgram,
  toConfiguration,
  type ProgramFormValues,
} from "./schemas";

const POINTS_CONFIG_KEYS = [
  "pointsPerEuro",
  "rounding",
  "minimumPurchase",
  "expiryMonths",
  "redemptionThresholds",
].sort();
const STAMPS_CONFIG_KEYS = [
  "requiredStamps",
  "stampsPerPurchase",
  "minimumPurchase",
  "expiryMonths",
  "maximumStampsPerTransaction",
].sort();

function pointsForm(overrides: Record<string, unknown> = {}) {
  return {
    ...emptyProgramFormValues("POINTS"),
    name: "Luna Points",
    description: "Earn and burn",
    redemptionThresholds: [{ cost: 100, label: "Free pastry" }],
    ...overrides,
  } as ProgramFormValues;
}

function stampsForm(overrides: Record<string, unknown> = {}) {
  return {
    ...emptyProgramFormValues("STAMPS"),
    name: "Roast Card",
    description: "Ten visits, free coffee",
    ...overrides,
  } as ProgramFormValues;
}

describe("programFormSchema", () => {
  it("accepts a complete payload for either model", () => {
    expect(programFormSchema.safeParse(pointsForm()).success).toBe(true);
    expect(programFormSchema.safeParse(stampsForm()).success).toBe(true);
  });

  it("requires the selected model's fields", () => {
    const noRate = programFormSchema.safeParse(
      pointsForm({ pointsPerEuro: undefined }),
    );
    expect(noRate.success).toBe(false);
    if (!noRate.success) {
      expect(noRate.error.issues[0]?.path).toEqual(["pointsPerEuro"]);
    }

    const noStamps = programFormSchema.safeParse(
      stampsForm({ requiredStamps: undefined }),
    );
    expect(noStamps.success).toBe(false);
    if (!noStamps.success) {
      expect(noStamps.error.issues[0]?.path).toEqual(["requiredStamps"]);
    }
  });

  it("maps a blank expiry to null instead of a number", () => {
    const parsed = programFormSchema.parse(pointsForm({ expiryMonths: "" }));
    expect(parsed.expiryMonths).toBeNull();
  });

  it("rejects out-of-range rules with field messages", () => {
    const result = programFormSchema.safeParse(
      pointsForm({
        pointsPerEuro: 0,
        redemptionThresholds: [{ cost: 100, label: "" }],
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain(
        "Earn rate must be at least 0.01 points per currency unit.",
      );
      expect(messages).toContain("Name what this threshold unlocks.");
    }
  });
});

describe("toConfiguration", () => {
  it("stores only the selected model's keys", () => {
    const points = toConfiguration(pointsForm()) as Record<string, unknown>;
    expect(Object.keys(points).sort()).toEqual(POINTS_CONFIG_KEYS);

    const stamps = toConfiguration(stampsForm()) as Record<string, unknown>;
    expect(Object.keys(stamps).sort()).toEqual(STAMPS_CONFIG_KEYS);
  });

  it("never mixes the two rule sets", () => {
    const points = toConfiguration(pointsForm()) as Record<string, unknown>;
    expect(points).not.toHaveProperty("requiredStamps");
    const stamps = toConfiguration(stampsForm()) as Record<string, unknown>;
    expect(stamps).not.toHaveProperty("pointsPerEuro");
  });
});

describe("isConfigurationValid", () => {
  it("accepts a stored configuration for its own type", () => {
    expect(isConfigurationValid("POINTS", toConfiguration(pointsForm()))).toBe(
      true,
    );
    expect(isConfigurationValid("STAMPS", toConfiguration(stampsForm()))).toBe(
      true,
    );
  });

  it("rejects a rule set that does not fill every field", () => {
    expect(
      isConfigurationValid("POINTS", { pointsPerEuro: 1, rounding: "FLOOR" }),
    ).toBe(false);
    expect(isConfigurationValid("STAMPS", { stampsPerVisit: 1 })).toBe(false);
    expect(isConfigurationValid("POINTS", null)).toBe(false);
  });
});

describe("isSameConfiguration", () => {
  it("compares structurally, so jsonb key order is irrelevant", () => {
    const a = { pointsPerEuro: 1, rounding: "FLOOR" };
    const b = { rounding: "FLOOR", pointsPerEuro: 1 };
    expect(isSameConfiguration(a, b)).toBe(true);
  });

  it("reports any value, key or array-order difference", () => {
    expect(
      isSameConfiguration({ pointsPerEuro: 1 }, { pointsPerEuro: 2 }),
    ).toBe(false);
    expect(isSameConfiguration({ pointsPerEuro: 1 }, {})).toBe(false);
    expect(
      isSameConfiguration(
        { thresholds: [{ cost: 100 }, { cost: 250 }] },
        { thresholds: [{ cost: 250 }, { cost: 100 }] },
      ),
    ).toBe(false);
  });
});

describe("programFormValues", () => {
  it("round-trips a stored rule set through the edit form", () => {
    const stored = toConfiguration(pointsForm());
    const values = programFormValues({
      type: "POINTS",
      name: "Luna Points",
      description: "Earn and burn",
      unitName: "points",
      configuration: stored,
    });
    expect(toConfiguration(values)).toEqual(stored);
  });
});

describe("summarizeProgram", () => {
  it("reports an unreadable rule set instead of throwing", () => {
    expect(
      summarizeProgram({ type: "POINTS", unitName: null, configuration: {} }),
    ).toEqual(["Configuration incomplete — finish the rules to activate."]);
  });

  it("describes the earning rule in plain language", () => {
    const bullets = summarizeProgram({
      type: "POINTS",
      unitName: "points",
      configuration: toConfiguration(pointsForm()),
      currency: "EUR",
    });
    expect(bullets[0]).toContain("Earn 1 points per 1 spent");
    expect(bullets.join(" ")).toContain("Free pastry");
  });
});
