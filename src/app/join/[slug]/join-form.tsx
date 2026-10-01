"use client";

import { report } from "@/auth/client-actions";
import { joinSignUpAction } from "@/features/customers/actions";
import {
  joinFormSchema,
  type JoinFormValues,
} from "@/features/customers/schemas";
import {
  AppForm,
  SubmitButton,
  TextField,
  useZodForm,
} from "@/components/patterns/form";

/**
 * Registration from a join URL (checklist §7 bullet 1).
 *
 * The form asks for what a *new* member needs and nothing about the merchant:
 * the slug travels with the submit payload, and the server re-validates the
 * link before it creates anything. Success redirects (Next's own control
 * flow), which `report` swallows — the failure branch is the only one that
 * reaches the toast.
 */
export function JoinSignUpForm({ slug }: { slug: string }) {
  const form = useZodForm(joinFormSchema, {
    defaultValues: { name: "", email: "", phone: "", password: "" },
  });

  async function onSubmit(values: JoinFormValues) {
    await report(() => joinSignUpAction({ ...values, slug }));
  }

  return (
    <AppForm form={form} onSubmit={onSubmit} className="gap-4">
      <TextField
        form={form}
        name="name"
        label="Your name"
        autoComplete="name"
        placeholder="Alex Rivera"
        required
      />
      <TextField
        form={form}
        name="email"
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        required
      />
      <TextField
        form={form}
        name="phone"
        label="Phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        description="Optional — used for receipts and balance texts."
      />
      <TextField
        form={form}
        name="password"
        label="Choose a password"
        type="password"
        autoComplete="new-password"
        description="At least 10 characters."
        required
      />
      <SubmitButton
        pending={form.formState.isSubmitting}
        pendingLabel="Creating your account…"
        className="w-full"
      >
        Create account and join
      </SubmitButton>
    </AppForm>
  );
}
