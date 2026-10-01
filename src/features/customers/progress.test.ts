import { describe, expect, it } from "vitest";

import { loyaltyProgress } from "./progress";

const POINTS_CONFIG = {
  pointsPerEuro: 2,
  rounding: "FLOOR" as const,
  minimumPurchase: 0,
  expiryMonths: null,
  redemptionThresholds: [
    { cost: 100, label: "Free coffee" },
    { cost: 250, label: "Free bag" },
  ],
};

const STAMP_CONFIG = {
  requiredStamps: 10,
  stampsPerPurchase: 1,
  minimumPurchase: 0,
  expiryMonths: null,
  maximumStampsPerTransaction: 3,
};

describe("loyaltyProgress — points", () => {
  it("aims at the next threshold above the balance", () => {
    const progress = loyaltyProgress({
      balance: 40,
      type: "POINTS",
      unitName: null,
      configuration: POINTS_CONFIG,
    });
    expect(progress).toEqual({
      unit: "points",
      balance: 40,
      target: 100,
      label: "Free coffee",
      percent: 40,
      complete: false,
    });
  });

  it("skips thresholds the member already reached and sorts the rest", () => {
    const progress = loyaltyProgress({
      balance: 150,
      type: "POINTS",
      unitName: "beans",
      configuration: {
        ...POINTS_CONFIG,
        redemptionThresholds: [
          { cost: 250, label: "Free bag" },
          { cost: 100, label: "Free coffee" },
        ],
      },
    });
    expect(progress.unit).toBe("beans");
    expect(progress.target).toBe(250);
    expect(progress.label).toBe("Free bag");
    expect(progress.percent).toBe(60);
  });

  it("starts again from the threshold above an exact match", () => {
    const progress = loyaltyProgress({
      balance: 100,
      type: "POINTS",
      unitName: null,
      configuration: POINTS_CONFIG,
    });
    expect(progress.target).toBe(250);
    expect(progress.percent).toBe(40);
  });

  it("reports complete once every threshold is reachable", () => {
    const progress = loyaltyProgress({
      balance: 999,
      type: "POINTS",
      unitName: null,
      configuration: POINTS_CONFIG,
    });
    expect(progress).toEqual({
      unit: "points",
      balance: 999,
      target: null,
      label: null,
      percent: 100,
      complete: true,
    });
  });
});

describe("loyaltyProgress — stamps", () => {
  it("measures the fill of the card", () => {
    const progress = loyaltyProgress({
      balance: 3,
      type: "STAMPS",
      unitName: null,
      configuration: STAMP_CONFIG,
    });
    expect(progress).toEqual({
      unit: "stamps",
      balance: 3,
      target: 10,
      label: null,
      percent: 30,
      complete: false,
    });
  });

  it("clamps at 100% once the card is full", () => {
    const progress = loyaltyProgress({
      balance: 12,
      type: "STAMPS",
      unitName: "coffee cards",
      configuration: STAMP_CONFIG,
    });
    expect(progress.unit).toBe("coffee cards");
    expect(progress.percent).toBe(100);
    expect(progress.complete).toBe(true);
  });
});

describe("loyaltyProgress — nothing to aim at", () => {
  it("stays neutral when there is no program", () => {
    const progress = loyaltyProgress({
      balance: 12,
      type: null,
      unitName: null,
      configuration: null,
    });
    expect(progress).toEqual({
      unit: "points",
      balance: 12,
      target: null,
      label: null,
      percent: 0,
      complete: false,
    });
  });

  it("stays neutral when the stored rules don't parse", () => {
    const progress = loyaltyProgress({
      balance: 12,
      type: "POINTS",
      unitName: null,
      configuration: { redemptionThresholds: [] },
    });
    expect(progress.target).toBeNull();
    expect(progress.percent).toBe(0);
    expect(progress.complete).toBe(false);
  });

  it("never trusts a non-finite balance", () => {
    const progress = loyaltyProgress({
      balance: Number.NaN,
      type: "STAMPS",
      unitName: null,
      configuration: STAMP_CONFIG,
    });
    expect(progress.balance).toBe(0);
    expect(progress.percent).toBe(0);
  });
});
