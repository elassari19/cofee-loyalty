import { z } from "zod";

/**
 * Reward fields a merchant fills in during onboarding (checklist §6 bullet 6,
 * PRD §18). `unit` is deliberately **not** part of the payload: it is derived
 * server-side from the merchant's program type, so a crafted request can
 * never price a points reward in stamps.
 */
export const rewardFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Reward name must be at least 2 characters.")
    .max(200, "Keep the reward name to 200 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(600, "Keep the description to 600 characters or fewer."),
  cost: z.coerce
    .number("Enter what the reward costs.")
    .int("The cost is a whole number of points or stamps.")
    .min(1, "A reward costs at least 1 point or stamp.")
    .max(1000000, "That cost looks too high."),
  terms: z
    .string()
    .trim()
    .max(400, "Keep the terms to 400 characters or fewer."),
  /** `YYYY-MM-DD` from a date input; blank means "never expires". */
  expiresAt: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: "Pick a valid expiry date.",
    }),
  /** Blank means unlimited; the preprocess maps it to `null` before the checks. */
  redemptionLimit: z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) return null;
    return typeof value === "number" ? value : Number(value);
  }, z.number("Enter how many times the reward may be redeemed.").int("The limit is a whole number.").min(1, "A limit must be at least 1.").max(1000000, "That limit looks too high.").nullable()),
});

export type RewardFormValues = z.infer<typeof rewardFormSchema>;

/**
 * The reward fields a client component needs to render or edit one — plain
 * JSON so it crosses the server → client boundary without entity classes or
 * live `Date` objects (`expiresAt` is an ISO string or `null`).
 */
export interface RewardSummary {
  id: string;
  name: string;
  description: string | null;
  terms: string | null;
  cost: number;
  unit: string;
  status: "active" | "inactive";
  redemptionCount: number;
  redemptionLimit: number | null;
  expiresAt: string | null;
}

/** Edit-form defaults for an existing reward — the inverse of `create`. */
export function rewardFormValues(
  reward: Pick<
    RewardSummary,
    "name" | "description" | "terms" | "cost" | "expiresAt" | "redemptionLimit"
  >,
): RewardFormValues {
  return {
    name: reward.name,
    description: reward.description ?? "",
    cost: reward.cost,
    terms: reward.terms ?? "",
    expiresAt: reward.expiresAt ? reward.expiresAt.slice(0, 10) : "",
    redemptionLimit: reward.redemptionLimit,
  };
}

export function emptyRewardFormValues(): RewardFormValues {
  return {
    name: "",
    description: "",
    cost: 100,
    terms: "",
    expiresAt: "",
    redemptionLimit: null,
  };
}
