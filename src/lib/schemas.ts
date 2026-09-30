import { z } from "zod";

/**
 * Shared form schemas (checklist §3 bullet 4).
 *
 * One definition per form feeds both the client-side `zodResolver` (fast,
 * field-level feedback) and the server action (the authoritative check — a
 * crafted request can never bypass the client validation, see
 * `src/auth/action-guard.ts`).
 */

export const loyaltySettingsSchema = z.object({
  programName: z
    .string()
    .trim()
    .min(2, "Program name must be at least 2 characters."),
  description: z
    .string()
    .trim()
    .max(240, "Keep the description to 240 characters or fewer."),
  earnRate: z.coerce
    .number()
    .min(0.1, "Earn rate must be at least 0.1 points per currency unit.")
    .max(1000, "That earn rate looks too high — enter a value under 1,000."),
  welcomeBonus: z.coerce
    .number()
    .min(0, "Welcome bonus cannot be negative.")
    .max(10000, "Welcome bonus is capped at 10,000 points."),
  pointsExpiryMonths: z.coerce
    .number()
    .int("Enter a whole number of months.")
    .min(1, "Points must expire after at least 1 month.")
    .max(120, "Expiry cannot exceed 120 months."),
  minPurchase: z.coerce
    .number()
    .min(0, "Minimum purchase cannot be negative.")
    .max(10000, "Minimum purchase looks too high."),
});
export type LoyaltySettingsValues = z.infer<typeof loyaltySettingsSchema>;

export const businessSettingsSchema = z.object({
  storeName: z
    .string()
    .trim()
    .min(2, "Store name must be at least 2 characters."),
  supportEmail: z.email("Enter a valid email address."),
  timezone: z.string().min(1, "Pick a timezone."),
  receiptFooter: z
    .string()
    .trim()
    .max(160, "Keep the receipt footer to 160 characters or fewer."),
  loyaltyEnabled: z.boolean(),
});
export type BusinessSettingsValues = z.infer<typeof businessSettingsSchema>;

export const CAMPAIGN_AUDIENCES = [
  "All customers",
  "Gold tier",
  "Dormant 60+ days",
] as const;

export const campaignSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, "Campaign name must be at least 3 characters."),
    audience: z.enum(
      CAMPAIGN_AUDIENCES,
      "Choose who should see this campaign.",
    ),
    startsOn: z.iso.date("Pick a start date."),
    endsOn: z.iso.date("Pick an end date."),
    terms: z
      .string()
      .trim()
      .max(200, "Keep the terms to 200 characters or fewer."),
  })
  .refine((values) => values.endsOn >= values.startsOn, {
    message: "The end date can't be before the start date.",
    path: ["endsOn"],
  });
export type CampaignValues = z.infer<typeof campaignSchema>;

export const purchaseSchema = z.object({
  customerId: z.string().min(1, "Select the customer making the purchase."),
  amount: z.coerce
    .number()
    .min(0.01, "Enter the purchase amount.")
    .max(100000, "That amount looks too high."),
});
export type PurchaseValues = z.infer<typeof purchaseSchema>;

export const redeemSchema = z.object({
  rewardId: z.string().min(1, "Select a reward."),
  customerId: z.string().min(1, "Select the customer redeeming."),
});
export type RedeemValues = z.infer<typeof redeemSchema>;

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.email("Enter a valid email address."),
  phone: z.string().trim().max(20, "That phone number looks too long."),
});
export type ProfileValues = z.infer<typeof profileSchema>;

/**
 * Passwords (checklist §5): the floor matches Better Auth's
 * `minPasswordLength`, so the client never promises what the server rejects.
 */
export const PASSWORD_MIN_LENGTH = 10;

const passwordField = (label: string) =>
  z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `${label} needs ${PASSWORD_MIN_LENGTH} characters or more.`,
    );

export const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
export type SignInValues = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.email("Enter a valid email address."),
  password: passwordField("Your password"),
});
export type SignUpValues = z.infer<typeof signUpSchema>;

export const passwordResetRequestSchema = z.object({
  email: z.email("Enter a valid email address."),
});
export type PasswordResetRequestValues = z.infer<
  typeof passwordResetRequestSchema
>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "That reset link is missing its token."),
  newPassword: passwordField("Your new password"),
});
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

/**
 * Server-side parse for action payloads. Throws the first issue message so the
 * caller can surface it as the operation's result.
 */
export function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      issue?.message ?? "Some fields are invalid. Nothing was saved.",
    );
  }
  return result.data;
}
