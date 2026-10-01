import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/errors";
import {
  calculateEarn,
  parsePurchaseAmount,
  parsePurchaseCurrency,
  unitLabel,
  type ProgramRules,
} from "./calculation";
import { emptyProgramFormValues, toConfiguration } from "./schemas";

const points: ProgramRules = {
  id: "program-points",
  type: "POINTS",
  unitName: "beans",
  ruleVersion: 3,
  configuration: toConfiguration({
    ...emptyProgramFormValues("POINTS"),
    pointsPerEuro: 2.5,
    rounding: "FLOOR",
    minimumPurchase: 5,
    redemptionThresholds: [{ cost: 100, label: "Free coffee" }],
  }),
};

const stamps: ProgramRules = {
  id: "program-stamps",
  type: "STAMPS",
  unitName: null,
  ruleVersion: 1,
  configuration: toConfiguration({
    ...emptyProgramFormValues("STAMPS"),
    requiredStamps: 10,
    stampsPerPurchase: 2,
    maximumStampsPerTransaction: 1,
    minimumPurchase: 10,
  }),
};

const base = { merchantCurrency: "EUR" } as const;

function errors(fn: () => unknown): { path: string; message: string }[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationError) return error.issues ?? [];
    throw error;
  }
  throw new Error("expected a ValidationError");
}

describe("parsePurchaseAmount", () => {
  it("accepts numbers and numeric strings", () => {
    expect(parsePurchaseAmount(12.5)).toBe(12.5);
    expect(parsePurchaseAmount("12.50")).toBe(12.5);
    expect(parsePurchaseAmount(0.01)).toBe(0.01);
  });

  it("rejects empty, non-numeric, non-positive, over-cap and fractional values", () => {
    expect(errors(() => parsePurchaseAmount(""))).toEqual([
      { path: "amount", message: "Enter the purchase amount." },
    ]);
    expect(errors(() => parsePurchaseAmount("twelve"))[0]?.path).toBe("amount");
    expect(errors(() => parsePurchaseAmount(0))[0]?.message).toBe(
      "A purchase amount must be greater than zero.",
    );
    expect(errors(() => parsePurchaseAmount(-4))[0]?.message).toBe(
      "A purchase amount must be greater than zero.",
    );
    expect(errors(() => parsePurchaseAmount(100001))[0]?.message).toBe(
      "A purchase amount cannot exceed 100000.",
    );
    expect(errors(() => parsePurchaseAmount(10.999))[0]?.message).toBe(
      "Use at most two decimal places.",
    );
    expect(errors(() => parsePurchaseAmount(Number.NaN))[0]?.message).toBe(
      "Enter the purchase amount.",
    );
  });
});

describe("parsePurchaseCurrency", () => {
  it("defaults to the merchant currency when omitted", () => {
    expect(parsePurchaseCurrency(undefined, "EUR")).toBe("EUR");
    expect(parsePurchaseCurrency("", "EUR")).toBe("EUR");
    expect(parsePurchaseCurrency("eur", "EUR")).toBe("EUR");
  });

  it("rejects a purchase in another currency", () => {
    expect(errors(() => parsePurchaseCurrency("USD", "EUR"))).toEqual([
      {
        path: "currency",
        message: "This store settles in EUR — enter the purchase in EUR.",
      },
    ]);
  });

  it("rejects a merchant without a settlement currency", () => {
    expect(errors(() => parsePurchaseCurrency("EUR", ""))[0]?.message).toBe(
      "This merchant has no valid settlement currency.",
    );
  });
});

describe("calculateEarn — points", () => {
  it("multiplies by the earn rate and floors per the program rule", () => {
    const result = calculateEarn({ ...base, program: points, amount: 10 });
    expect(result).toMatchObject({
      qualified: true,
      delta: 25,
      unit: "POINTS",
      unitName: "beans",
      programId: "program-points",
      ruleVersion: 3,
      amount: 10,
      currency: "EUR",
      message: null,
    });
  });

  it("applies CEIL and ROUND modes", () => {
    const withRounding = (rounding: string) => ({
      ...points,
      configuration: {
        ...(points.configuration as Record<string, unknown>),
        rounding,
        minimumPurchase: 0,
      },
    });
    // 1.1 × 2.5 = 2.75
    expect(
      calculateEarn({
        ...base,
        program: withRounding("CEIL"),
        amount: 1.1,
      }).delta,
    ).toBe(3);
    expect(
      calculateEarn({
        ...base,
        program: withRounding("ROUND"),
        amount: 1.1,
      }).delta,
    ).toBe(3);
    expect(
      calculateEarn({
        ...base,
        program: withRounding("FLOOR"),
        amount: 1.1,
      }).delta,
    ).toBe(2);
  });

  it("does not award below the minimum purchase", () => {
    const result = calculateEarn({ ...base, program: points, amount: 4.99 });
    expect(result).toMatchObject({ qualified: false, delta: 0 });
    expect(result.message).toBe("Purchases under €5.00 do not earn beans.");
  });

  it("treats a zero minimum as 'every purchase qualifies'", () => {
    const every = calculateEarn({
      ...base,
      program: {
        ...points,
        configuration: {
          ...(points.configuration as Record<string, unknown>),
          minimumPurchase: 0,
          pointsPerEuro: 1,
        },
      },
      amount: 1,
    });
    expect(every).toMatchObject({ qualified: true, delta: 1 });
  });

  it("reports a purchase that rounds to zero instead of awarding it", () => {
    const result = calculateEarn({
      ...base,
      program: {
        ...points,
        configuration: {
          ...(points.configuration as Record<string, unknown>),
          pointsPerEuro: 0.01,
          rounding: "FLOOR",
          minimumPurchase: 0,
        },
      },
      amount: 1,
    });
    expect(result).toMatchObject({ qualified: false, delta: 0 });
    expect(result.message).toContain("rounds down to 0");
  });

  it("absorbs float drift so FLOOR never loses a whole unit", () => {
    const result = calculateEarn({
      ...base,
      program: {
        ...points,
        configuration: {
          ...(points.configuration as Record<string, unknown>),
          pointsPerEuro: 100,
          rounding: "FLOOR",
          minimumPurchase: 0,
        },
      },
      // 4.35 × 100 = 434.99999999999994 in IEEE-754 — must floor to 435.
      amount: 4.35,
    });
    expect(result.delta).toBe(435);
  });

  it("rejects an invalid purchase before calculating", () => {
    expect(
      errors(() => calculateEarn({ ...base, program: points, amount: -1 }))[0]
        ?.path,
    ).toBe("amount");
    expect(
      errors(() =>
        calculateEarn({ ...base, program: points, amount: 1, currency: "USD" }),
      )[0]?.path,
    ).toBe("currency");
  });

  it("rejects a corrupted rule set through the shared schema", () => {
    expect(() =>
      calculateEarn({
        ...base,
        program: { ...points, configuration: { pointsPerEuro: -1 } },
        amount: 10,
      }),
    ).toThrow("Earn rate must be at least 0.01 points per currency unit.");
  });
});

describe("calculateEarn — stamps", () => {
  it("awards the per-purchase stamps when the purchase qualifies", () => {
    const result = calculateEarn({ ...base, program: stamps, amount: 25 });
    expect(result).toMatchObject({
      qualified: true,
      unit: "STAMPS",
      unitName: "stamps",
      delta: 1,
    });
  });

  it("caps the award at maximumStampsPerTransaction", () => {
    const result = calculateEarn({
      ...base,
      program: {
        ...stamps,
        configuration: {
          ...(stamps.configuration as Record<string, unknown>),
          stampsPerPurchase: 3,
          maximumStampsPerTransaction: 2,
        },
      },
      amount: 25,
    });
    expect(result.delta).toBe(2);
  });

  it("does not award below the minimum purchase", () => {
    const result = calculateEarn({ ...base, program: stamps, amount: 9.5 });
    expect(result).toMatchObject({ qualified: false, delta: 0 });
  });
});

describe("unitLabel", () => {
  it("prefers the configured unit name and falls back to the model", () => {
    expect(unitLabel(points)).toBe("beans");
    expect(unitLabel({ type: "STAMPS", unitName: null })).toBe("stamps");
    expect(unitLabel({ type: "POINTS", unitName: "" })).toBe("points");
  });
});
