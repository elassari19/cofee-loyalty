import type { LoyaltyType } from "@/db/entities/enums";
import {
  isConfigurationValid,
  type PointsConfiguration,
  type StampConfiguration,
} from "@/features/loyalty/schemas";

/**
 * Balance → progress (checklist §7 bullet 5, PRD §11/§12).
 *
 * The dashboard answers "how far to the next thing I can get?" from data the
 * *program* already owns, so it never invents a tier ladder of its own:
 *
 * - **points** — the next redemption threshold above the balance, with its
 *   label. Every threshold reached means `complete`, not "no goal left to
 *   show".
 * - **stamps** — the card's `requiredStamps` and how much of it is filled.
 * - **no program / unreadable rules** — a neutral result (`target: null`,
 *   `complete: false`) so the page renders the balance and hides the bar
 *   instead of guessing at a target the merchant never configured.
 *
 * Pure module: no database, no request state, unit-testable in isolation.
 */

export interface LoyaltyProgress {
  /** Program's own display unit ("points", "stamps", "coffee cards"). */
  unit: string;
  balance: number;
  /** Units in `unit` needed for the next milestone; `null` when none/unknown. */
  target: number | null;
  /** Milestone name from the rules, when the program gave one a label. */
  label: string | null;
  /** Whole-percent progress towards `target` (0–100). */
  percent: number;
  /** True when there is nothing left to reach. */
  complete: boolean;
}

export interface LoyaltyProgressInput {
  balance: number;
  type: LoyaltyType | null;
  /** `loyalty_program.unit_name`, or `null` to fall back to the model name. */
  unitName: string | null;
  configuration: unknown;
}

export function loyaltyProgress(input: LoyaltyProgressInput): LoyaltyProgress {
  const balance = Number.isFinite(input.balance) ? input.balance : 0;
  const unit =
    input.unitName?.trim() || (input.type === "STAMPS" ? "stamps" : "points");

  if (!input.type || !isConfigurationValid(input.type, input.configuration)) {
    return {
      unit,
      balance,
      target: null,
      label: null,
      percent: 0,
      complete: false,
    };
  }

  if (input.type === "STAMPS") {
    const config = input.configuration as StampConfiguration;
    return {
      unit,
      balance,
      target: config.requiredStamps,
      label: null,
      percent: percentOf(balance, config.requiredStamps),
      complete: balance >= config.requiredStamps,
    };
  }

  const config = input.configuration as PointsConfiguration;
  const next = [...config.redemptionThresholds]
    .sort((a, b) => a.cost - b.cost)
    .find((threshold) => threshold.cost > balance);
  if (!next) {
    return {
      unit,
      balance,
      target: null,
      label: null,
      percent: 100,
      complete: true,
    };
  }
  return {
    unit,
    balance,
    target: next.cost,
    label: next.label,
    percent: percentOf(balance, next.cost),
    complete: false,
  };
}

/** Whole-percent towards `target`, clamped to 0–100 and never dividing by 0. */
function percentOf(balance: number, target: number): number {
  if (target <= 0) return 100;
  return Math.min(100, Math.max(0, Math.floor((balance / target) * 100)));
}
