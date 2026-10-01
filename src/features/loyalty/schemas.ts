import { z } from "zod";

import { LOYALTY_TYPES, type LoyaltyType } from "@/db/entities/enums";
import { parseInput } from "@/lib/schemas";

/**
 * Loyalty program configuration (checklist §6 bullets 2–5, PRD §11/§12).
 *
 * Three layers, each stricter than the last:
 *
 *   1. `pointsConfigurationSchema` / `stampConfigurationSchema` — the stored
 *      `jsonb` rule set for exactly one model. Both are validated on the
 *      server whenever a rule set is written *or* read back, so a hand-edited
 *      row can never feed the earning engine an unusable value.
 *   2. `programFormSchema` — the flat form payload. It requires the fields of
 *      the *selected* model and nothing about the other one, which is what
 *      makes "exactly one model, never a mix" a validation rule instead of a
 *      UI convention.
 *   3. `toConfiguration()` — serialises a form payload into the stored rule
 *      set for its type, dropping every field of the other model.
 *
 * This module is pure (no database, no request state) so forms, server
 * actions, services and tests all share one definition of "valid".
 */

export const ROUNDING_MODES = ["FLOOR", "ROUND", "CEIL"] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

const ROUNDING_LABELS: Record<RoundingMode, string> = {
  FLOOR: "down",
  ROUND: "to the nearest whole",
  CEIL: "up",
};

/**
 * Blank (or absent) expiry means "never expires"; otherwise 1–120 months.
 * The preprocess maps the empty form string to `null` before the number
 * check, so the client can leave the field empty without inventing a value.
 */
const expiryMonthsField = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  return typeof value === "number" ? value : Number(value);
}, z.number("Enter how many months until expiry, or leave it blank.").int("Enter a whole number of months.").min(1, "Expiry must be at least 1 month.").max(120, "Expiry cannot exceed 120 months.").nullable());

const minimumPurchaseField = z.coerce
  .number("Enter the minimum purchase amount.")
  .min(0, "Minimum purchase cannot be negative.")
  .max(100000, "Minimum purchase looks too high.");

const thresholdSchema = z.object({
  cost: z.coerce
    .number("Enter the point cost.")
    .int("Point costs are whole numbers.")
    .min(1, "A threshold costs at least 1 point.")
    .max(1000000, "That threshold looks too high."),
  label: z
    .string()
    .trim()
    .min(1, "Name what this threshold unlocks.")
    .max(60, "Keep threshold labels to 60 characters or fewer."),
});
export type RedemptionThreshold = z.infer<typeof thresholdSchema>;

/** Model A — points (PRD §11). */
export const pointsConfigurationSchema = z.object({
  pointsPerEuro: z.coerce
    .number("Enter how many points a customer earns per currency unit.")
    .min(0.01, "Earn rate must be at least 0.01 points per currency unit.")
    .max(1000, "That earn rate looks too high — enter a value under 1,000."),
  rounding: z.enum(ROUNDING_MODES, "Choose how partial points are rounded."),
  minimumPurchase: minimumPurchaseField,
  expiryMonths: expiryMonthsField,
  redemptionThresholds: z
    .array(thresholdSchema)
    .min(1, "Add at least one redemption threshold.")
    .max(6, "Keep it to 6 thresholds or fewer."),
});
export type PointsConfiguration = z.infer<typeof pointsConfigurationSchema>;

/** Model B — stamp card (PRD §12). */
export const stampConfigurationSchema = z.object({
  requiredStamps: z.coerce
    .number("Enter how many stamps complete the card.")
    .int("Stamp counts are whole numbers.")
    .min(1, "A card needs at least 1 stamp.")
    .max(100, "A card needs 100 stamps or fewer."),
  stampsPerPurchase: z.coerce
    .number("Enter how many stamps a qualifying purchase earns.")
    .int("Stamp counts are whole numbers.")
    .min(1, "A purchase must earn at least 1 stamp.")
    .max(20, "20 stamps per purchase is the maximum."),
  minimumPurchase: minimumPurchaseField,
  expiryMonths: expiryMonthsField,
  maximumStampsPerTransaction: z.coerce
    .number("Enter the maximum stamps a single transaction can earn.")
    .int("Stamp counts are whole numbers.")
    .min(1, "Allow at least 1 stamp per transaction.")
    .max(20, "20 stamps per transaction is the maximum."),
});
export type StampConfiguration = z.infer<typeof stampConfigurationSchema>;

/**
 * The form payload: flat so one form serves both models, with a refinement
 * that requires *exactly* the selected model's fields. Fields of the other
 * model must be absent (the form clears them when the model switches).
 */
export const programFormSchema = z
  .object({
    type: z.enum(
      LOYALTY_TYPES,
      "Choose exactly one loyalty model: points or stamps.",
    ),
    name: z
      .string()
      .trim()
      .min(2, "Program name must be at least 2 characters.")
      .max(200, "Keep the program name to 200 characters or fewer."),
    description: z
      .string()
      .trim()
      .max(240, "Keep the description to 240 characters or fewer."),
    unitName: z
      .string()
      .trim()
      .min(1, "Name the unit, e.g. points or stamps.")
      .max(60, "Keep the unit name to 60 characters or fewer."),
    minimumPurchase: minimumPurchaseField,
    expiryMonths: expiryMonthsField,
    // Points-only rules.
    pointsPerEuro: z.coerce
      .number("Enter how many points a customer earns per currency unit.")
      .min(0.01, "Earn rate must be at least 0.01 points per currency unit.")
      .max(1000, "That earn rate looks too high — enter a value under 1,000.")
      .optional(),
    rounding: z
      .enum(ROUNDING_MODES, "Choose how partial points are rounded.")
      .optional(),
    redemptionThresholds: z
      .array(thresholdSchema)
      .min(1, "Add at least one redemption threshold.")
      .max(6, "Keep it to 6 thresholds or fewer.")
      .optional(),
    // Stamp-only rules.
    requiredStamps: z.coerce
      .number("Enter how many stamps complete the card.")
      .int("Stamp counts are whole numbers.")
      .min(1, "A card needs at least 1 stamp.")
      .max(100, "A card needs 100 stamps or fewer.")
      .optional(),
    stampsPerPurchase: z.coerce
      .number("Enter how many stamps a qualifying purchase earns.")
      .int("Stamp counts are whole numbers.")
      .min(1, "A purchase must earn at least 1 stamp.")
      .max(20, "20 stamps per purchase is the maximum.")
      .optional(),
    maximumStampsPerTransaction: z.coerce
      .number("Enter the maximum stamps a single transaction can earn.")
      .int("Stamp counts are whole numbers.")
      .min(1, "Allow at least 1 stamp per transaction.")
      .max(20, "20 stamps per transaction is the maximum.")
      .optional(),
  })
  .superRefine((values, ctx) => {
    if (values.type === "POINTS") {
      if (values.pointsPerEuro === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["pointsPerEuro"],
          message: "Enter how many points a customer earns per currency unit.",
        });
      }
      if (values.rounding === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["rounding"],
          message: "Choose how partial points are rounded.",
        });
      }
      if (values.redemptionThresholds === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["redemptionThresholds"],
          message: "Add at least one redemption threshold.",
        });
      }
      return;
    }
    if (values.requiredStamps === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["requiredStamps"],
        message: "Enter how many stamps complete the card.",
      });
    }
    if (values.stampsPerPurchase === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["stampsPerPurchase"],
        message: "Enter how many stamps a qualifying purchase earns.",
      });
    }
    if (values.maximumStampsPerTransaction === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["maximumStampsPerTransaction"],
        message: "Enter the maximum stamps a single transaction can earn.",
      });
    }
  });

export type ProgramFormValues = z.infer<typeof programFormSchema>;

/**
 * Serialises a validated form payload into the stored rule set for its type.
 * Only the selected model's keys survive, so the two rule sets can never mix
 * inside `loyalty_program.configuration`.
 */
export function toConfiguration(
  values: ProgramFormValues,
): PointsConfiguration | StampConfiguration {
  if (values.type === "POINTS") {
    return parseInput(pointsConfigurationSchema, {
      pointsPerEuro: values.pointsPerEuro,
      rounding: values.rounding,
      minimumPurchase: values.minimumPurchase,
      expiryMonths: values.expiryMonths ?? null,
      redemptionThresholds: values.redemptionThresholds,
    });
  }
  return parseInput(stampConfigurationSchema, {
    requiredStamps: values.requiredStamps,
    stampsPerPurchase: values.stampsPerPurchase,
    minimumPurchase: values.minimumPurchase,
    expiryMonths: values.expiryMonths ?? null,
    maximumStampsPerTransaction: values.maximumStampsPerTransaction,
  });
}

/** Validates a stored rule set for its type (used on write *and* on read). */
export function parseStoredConfiguration(
  type: LoyaltyType,
  raw: unknown,
): PointsConfiguration | StampConfiguration {
  return type === "POINTS"
    ? parseInput(pointsConfigurationSchema, raw)
    : parseInput(stampConfigurationSchema, raw);
}

/** Non-throwing variant — drives onboarding progress and readiness checks. */
export function isConfigurationValid(type: LoyaltyType, raw: unknown): boolean {
  const result =
    type === "POINTS"
      ? pointsConfigurationSchema.safeParse(raw)
      : stampConfigurationSchema.safeParse(raw);
  return result.success;
}

/**
 * Structural equality for stored rule sets. `jsonb` does not preserve key
 * order, so `JSON.stringify` comparison would bump `rule_version` for a
 * no-op save; this walks both values instead.
 */
export function isSameConfiguration(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length &&
      a.every((item, i) => isSameConfiguration(item, b[i]))
    );
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    const bRecord = b as Record<string, unknown>;
    return aKeys.every(
      (key) =>
        key in bRecord &&
        isSameConfiguration((a as Record<string, unknown>)[key], bRecord[key]),
    );
  }
  return false;
}

/** Form defaults for a program that does not exist yet. */
export function emptyProgramFormValues(
  type: LoyaltyType = "POINTS",
): ProgramFormValues {
  const shared = {
    name: "",
    description: "",
    unitName: type === "POINTS" ? "points" : "stamps",
    minimumPurchase: 0,
    expiryMonths: null,
  } as const;
  if (type === "POINTS") {
    return {
      ...shared,
      type: "POINTS",
      pointsPerEuro: 1,
      rounding: "FLOOR",
      redemptionThresholds: [{ cost: 100, label: "" }],
      requiredStamps: undefined,
      stampsPerPurchase: undefined,
      maximumStampsPerTransaction: undefined,
    };
  }
  return {
    ...shared,
    type: "STAMPS",
    requiredStamps: 10,
    stampsPerPurchase: 1,
    maximumStampsPerTransaction: 1,
    pointsPerEuro: undefined,
    rounding: undefined,
    redemptionThresholds: undefined,
  };
}

/** Form defaults for an existing program row (used by edit forms). */
export function programFormValues(input: {
  type: LoyaltyType;
  name: string;
  description: string | null;
  unitName: string | null;
  configuration: unknown;
}): ProgramFormValues {
  const shared = {
    name: input.name,
    description: input.description ?? "",
    unitName: input.unitName ?? (input.type === "POINTS" ? "points" : "stamps"),
  } as const;
  if (input.type === "POINTS") {
    const config = parseStoredConfiguration(
      "POINTS",
      input.configuration,
    ) as PointsConfiguration;
    return {
      ...shared,
      type: "POINTS",
      minimumPurchase: config.minimumPurchase,
      expiryMonths: config.expiryMonths,
      pointsPerEuro: config.pointsPerEuro,
      rounding: config.rounding,
      redemptionThresholds: config.redemptionThresholds,
      requiredStamps: undefined,
      stampsPerPurchase: undefined,
      maximumStampsPerTransaction: undefined,
    };
  }
  const config = parseStoredConfiguration(
    "STAMPS",
    input.configuration,
  ) as StampConfiguration;
  return {
    ...shared,
    type: "STAMPS",
    minimumPurchase: config.minimumPurchase,
    expiryMonths: config.expiryMonths,
    requiredStamps: config.requiredStamps,
    stampsPerPurchase: config.stampsPerPurchase,
    maximumStampsPerTransaction: config.maximumStampsPerTransaction,
    pointsPerEuro: undefined,
    rounding: undefined,
    redemptionThresholds: undefined,
  };
}

// ---------------------------------------------------------------------------
// Register and adjustment payloads (checklist §8)
// ---------------------------------------------------------------------------

/**
 * Upper bound shared by purchase amounts and manual adjustments: far above
 * any real sale, low enough that a fat-fingered exponent is rejected instead
 * of writing an absurd ledger entry.
 */
export const MAX_PURCHASE_AMOUNT = 100000;
export const MAX_ADJUSTMENT_DELTA = 100000;
export const MAX_REASON_LENGTH = 200;

/**
 * The cashier's amount field. The member is *not* part of this form: it comes
 * from the scanned card (or the picker) and is carried in component state, so
 * a crafted POST cannot silently retarget a confirmed amount at another
 * member — the server resolves and re-validates the member anyway.
 */
export const purchaseEntrySchema = z.object({
  amount: z.coerce
    .number("Enter the purchase amount.")
    .positive("A purchase amount must be greater than zero.")
    .max(
      MAX_PURCHASE_AMOUNT,
      `A purchase amount cannot exceed ${MAX_PURCHASE_AMOUNT}.`,
    ),
});
export type PurchaseEntryValues = z.infer<typeof purchaseEntrySchema>;

/**
 * Manual balance adjustment (PRD §22): signed whole amount plus a mandatory
 * reason. The capability check (`transactions.adjust`) lives in the action and
 * again in the service — this is only the shape check.
 */
export const adjustmentSchema = z.object({
  membershipId: z.string().min(1, "Select a member."),
  delta: z.coerce
    .number("Enter how much to add or remove.")
    .int("Use whole units only.")
    .refine((value) => value !== 0, "An adjustment must change the balance.")
    .refine(
      (value) => Math.abs(value) <= MAX_ADJUSTMENT_DELTA,
      `An adjustment cannot move more than ${MAX_ADJUSTMENT_DELTA} at once.`,
    ),
  reason: z
    .string()
    .trim()
    .min(3, "Give a reason for the adjustment (at least 3 characters).")
    .max(
      MAX_REASON_LENGTH,
      `Keep the reason to ${MAX_REASON_LENGTH} characters or fewer.`,
    ),
});
export type AdjustmentValues = z.infer<typeof adjustmentSchema>;

export interface ProgramSummaryInput {
  type: LoyaltyType;
  unitName: string | null;
  configuration: unknown;
  /** Merchant currency — only used to render amounts in the preview. */
  currency?: string;
}

/**
 * Human-readable rule bullets (used by the loyalty page and the
 * customer-facing preview). Never throws: an unreadable rule set is reported
 * as "configuration incomplete" rather than crashing the page.
 */
export function summarizeProgram(input: ProgramSummaryInput): string[] {
  const unit =
    input.unitName ?? (input.type === "POINTS" ? "points" : "stamps");
  if (input.type === "POINTS") {
    if (!isConfigurationValid("POINTS", input.configuration)) {
      return ["Configuration incomplete — finish the rules to activate."];
    }
    const config = input.configuration as PointsConfiguration;
    const bullets = [
      `Earn ${formatValue(config.pointsPerEuro)} ${unit} per 1 spent, rounded ${ROUNDING_LABELS[config.rounding]}.`,
    ];
    if (config.minimumPurchase > 0) {
      bullets.push(
        `Minimum purchase ${formatAmount(config.minimumPurchase, input.currency)}.`,
      );
    } else {
      bullets.push("Every purchase qualifies.");
    }
    bullets.push(
      config.expiryMonths === null
        ? `${unit.charAt(0).toUpperCase()}${unit.slice(1)} never expire.`
        : `${unit.charAt(0).toUpperCase()}${unit.slice(1)} expire after ${config.expiryMonths} months.`,
    );
    for (const threshold of config.redemptionThresholds) {
      bullets.push(`${threshold.cost} ${unit} → ${threshold.label}.`);
    }
    return bullets;
  }

  if (!isConfigurationValid("STAMPS", input.configuration)) {
    return ["Configuration incomplete — finish the rules to activate."];
  }
  const config = input.configuration as StampConfiguration;
  const bullets = [
    `${formatValue(config.stampsPerPurchase)} ${unit} per qualifying purchase (max ${config.maximumStampsPerTransaction} per transaction).`,
    config.minimumPurchase > 0
      ? `Qualifying purchase: at least ${formatAmount(config.minimumPurchase, input.currency)}.`
      : "Every purchase qualifies.",
    `Collect ${config.requiredStamps} ${unit} to unlock the reward.`,
    config.expiryMonths === null
      ? `${unit.charAt(0).toUpperCase()}${unit.slice(1)} never expire.`
      : `${unit.charAt(0).toUpperCase()}${unit.slice(1)} expire after ${config.expiryMonths} months.`,
  ];
  return bullets;
}

function formatValue(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2)));
}

function formatAmount(value: number, currency?: string): string {
  if (!currency) return String(value);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}
