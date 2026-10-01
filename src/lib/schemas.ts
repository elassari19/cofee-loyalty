import { z } from "zod";

/**
 * Shared form schemas (checklist §3 bullet 4).
 *
 * One definition per form feeds both the client-side `zodResolver` (fast,
 * field-level feedback) and the server action (the authoritative check — a
 * crafted request can never bypass the client validation, see
 * `src/auth/action-guard.ts`).
 *
 * Business-profile and loyalty-rule schemas moved to their features
 * (`@/features/merchants/schemas`, `@/features/loyalty/schemas`) when §6
 * replaced the demo settings with database-backed ones.
 */

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
