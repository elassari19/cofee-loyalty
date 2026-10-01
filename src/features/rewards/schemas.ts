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
