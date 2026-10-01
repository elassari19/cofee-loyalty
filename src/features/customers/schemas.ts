import { z } from "zod";

import { PASSWORD_MIN_LENGTH } from "@/lib/schemas";

/**
 * Customer-facing payloads (checklist §7 bullets 1 and 6).
 *
 * Join and profile forms validate in the browser for instant feedback and
 * re-validate in the server action before anything is written — the same
 * schema both sides, so a crafted POST can never skip a rule the form
 * showed. Email is *not* part of the profile editor: it is the account's
 * sign-in identity, changed through the auth flow (never here), so the
 * profile form can't silently fork the login address from the row.
 */

export const joinFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(200, "Keep your name to 200 characters or fewer."),
  email: z.email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .max(20, "That phone number looks too long.")
    .or(z.literal("")),
  password: z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `Your password needs ${PASSWORD_MIN_LENGTH} characters or more.`,
    ),
});
export type JoinFormValues = z.infer<typeof joinFormSchema>;

export const profileFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(200, "Keep your name to 200 characters or fewer."),
  phone: z
    .string()
    .trim()
    .max(20, "That phone number looks too long.")
    .or(z.literal("")),
});
export type ProfileFormValues = z.infer<typeof profileFormSchema>;

/**
 * Changing the password requires the current one and — because a password
 * change is the standard response to "someone else has my session" — always
 * revokes every *other* session afterwards (checklist §5).
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `Your new password needs ${PASSWORD_MIN_LENGTH} characters or more.`,
    ),
});
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

/**
 * The one value a join action accepts from the client: the merchant slug.
 * It is *not* an id — enrollment re-resolves it server-side (and a crafted
 * value only ever produces "no such merchant"), so the field is validated for
 * shape rather than trusted as a reference.
 */
export const joinRequestSchema = z.object({
  slug: z.string().trim().min(1, "That join link isn't valid.").max(200),
});
export type JoinRequestValues = z.infer<typeof joinRequestSchema>;
