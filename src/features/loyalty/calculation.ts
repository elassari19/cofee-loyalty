import type { LoyaltyType, LoyaltyUnit } from "@/db/entities/enums";
import { ValidationError, type FieldIssue } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import {
  MAX_PURCHASE_AMOUNT,
  parseStoredConfiguration,
  type PointsConfiguration,
  type StampConfiguration,
} from "./schemas";

/**
 * The earning engine (checklist §8 bullet 1 — "the server-side loyalty
 * service must be the only authority for … earning", PRD §11/§12).
 *
 * This module is deliberately pure: it takes a program's stored rule set plus
 * an untrusted purchase and returns what that purchase earns, or throws a
 * field-level validation error. Nothing here reads the database, the request
 * or the clock, so the same calculation is exercised by the preview action,
 * the write path, and `calculation.test.ts`.
 *
 * The preview shown to a cashier is therefore *the* calculation the ledger
 * will apply — there is no second implementation to drift.
 *
 * Validation of the purchase itself (positive amount, currency match, limits)
 * lives here too, so one call answers "is this purchase valid, and what does
 * it earn?".
 */

/** Program columns the engine needs — matches `LoyaltyProgram` rows. */
export interface ProgramRules {
  id: string;
  type: LoyaltyType;
  unitName: string | null;
  ruleVersion: number;
  configuration: unknown;
}

export interface CalculateEarnInput {
  program: ProgramRules;
  /** Untrusted purchase amount: number or numeric string. */
  amount: unknown;
  /** Currency the cashier submitted; defaults to the merchant's currency. */
  currency?: unknown;
  /** Currency the merchant settled on — the only one that can be earned in. */
  merchantCurrency: string;
}

export interface EarnResult {
  /** Program dimension moved: `POINTS` or `STAMPS`. */
  unit: LoyaltyUnit;
  /** Display name of that dimension (program `unit_name`, else model name). */
  unitName: string;
  /** Signed change to apply: 0 when the purchase does not qualify. */
  delta: number;
  qualified: boolean;
  /** Why nothing was earned (null when the purchase qualifies). */
  message: string | null;
  programId: string;
  ruleVersion: number;
  /** Normalised amount / currency the entry will be recorded with. */
  amount: number;
  currency: string;
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * Validates and normalises an untrusted purchase amount: a finite number or
 * numeric string, greater than zero, at most two decimals, within the
 * platform cap. Anything else is a 400 with an `amount` field issue rather
 * than an opaque database error.
 */
export function parsePurchaseAmount(value: unknown): number {
  const issues: FieldIssue[] = [];
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(amount)) {
    issues.push({ path: "amount", message: "Enter the purchase amount." });
  } else if (amount <= 0) {
    issues.push({
      path: "amount",
      message: "A purchase amount must be greater than zero.",
    });
  } else if (amount > MAX_PURCHASE_AMOUNT) {
    issues.push({
      path: "amount",
      message: `A purchase amount cannot exceed ${MAX_PURCHASE_AMOUNT}.`,
    });
  } else if (Math.round(amount * 100) / 100 !== amount) {
    issues.push({
      path: "amount",
      message: "Use at most two decimal places.",
    });
  }

  if (issues.length > 0) throw new ValidationError(issues);
  return amount;
}

/**
 * The submitted currency must equal the merchant's currency: value earned in
 * one currency can never be credited against a purchase in another (PRD §13).
 * Omitted currency means "the merchant's currency".
 */
export function parsePurchaseCurrency(
  value: unknown,
  merchantCurrency: string,
): string {
  const submitted =
    value === undefined || value === null || value === ""
      ? merchantCurrency
      : String(value).trim().toUpperCase();

  if (!CURRENCY_PATTERN.test(merchantCurrency)) {
    throw new ValidationError([
      {
        path: "currency",
        message: "This merchant has no valid settlement currency.",
      },
    ]);
  }
  if (submitted !== merchantCurrency) {
    throw new ValidationError([
      {
        path: "currency",
        message: `This store settles in ${merchantCurrency} — enter the purchase in ${merchantCurrency}.`,
      },
    ]);
  }
  return merchantCurrency;
}

/** `beans` → `beans`, blank → the model's default name (`points`/`stamps`). */
export function unitLabel(
  program: Pick<ProgramRules, "type" | "unitName">,
): string {
  return program.unitName || (program.type === "POINTS" ? "points" : "stamps");
}

function applyRounding(
  value: number,
  mode: PointsConfiguration["rounding"],
): number {
  // The epsilon absorbs binary-float drift (0.1 * 3 → 0.30000000000000004)
  // so `FLOOR` of 3 units never lands on 2.9999…9 → 2.
  switch (mode) {
    case "FLOOR":
      return Math.floor(value + 1e-9);
    case "CEIL":
      return Math.ceil(value - 1e-9);
    case "ROUND":
      return Math.round(value);
  }
}

/**
 * Runs the stored rule set against one purchase.
 *
 * - POINTS: `amount × pointsPerEuro` rounded per the program's mode, gated by
 *   `minimumPurchase`.
 * - STAMPS: `stampsPerPurchase` per qualifying purchase, capped by
 *   `maximumStampsPerTransaction`.
 *
 * A purchase that earns nothing returns `delta: 0` with a reason instead of
 * writing a zero-delta row — the database forbids those anyway.
 */
export function calculateEarn(input: CalculateEarnInput): EarnResult {
  const amount = parsePurchaseAmount(input.amount);
  const currency = parsePurchaseCurrency(
    input.currency,
    input.merchantCurrency,
  );
  const unit: LoyaltyUnit = input.program.type;
  const unitName = unitLabel(input.program);
  const shared = {
    unit,
    unitName,
    programId: input.program.id,
    ruleVersion: input.program.ruleVersion,
    amount,
    currency,
  } as const;

  if (input.program.type === "POINTS") {
    const config = parseStoredConfiguration(
      "POINTS",
      input.program.configuration,
    ) as PointsConfiguration;

    if (amount < config.minimumPurchase) {
      return {
        ...shared,
        delta: 0,
        qualified: false,
        message: `Purchases under ${formatMoney(config.minimumPurchase, currency)} do not earn ${unitName}.`,
      };
    }

    const delta = applyRounding(amount * config.pointsPerEuro, config.rounding);
    if (delta <= 0) {
      return {
        ...shared,
        delta: 0,
        qualified: false,
        message: `This purchase rounds down to 0 ${unitName}.`,
      };
    }
    return { ...shared, delta, qualified: true, message: null };
  }

  const config = parseStoredConfiguration(
    "STAMPS",
    input.program.configuration,
  ) as StampConfiguration;

  if (amount < config.minimumPurchase) {
    return {
      ...shared,
      delta: 0,
      qualified: false,
      message: `Purchases under ${formatMoney(config.minimumPurchase, currency)} do not earn ${unitName}.`,
    };
  }

  const delta = Math.min(
    config.stampsPerPurchase,
    config.maximumStampsPerTransaction,
  );
  return { ...shared, delta, qualified: true, message: null };
}
