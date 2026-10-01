"use client";

import { changePasswordAction } from "@/features/customers/actions";
import {
  changePasswordSchema,
  type ChangePasswordValues,
} from "@/features/customers/schemas";
import {
  AppForm,
  FormActions,
  SubmitButton,
  TextField,
  useZodForm,
} from "@/components/patterns/form";
import { notify } from "@/components/patterns/toast";

/**
 * Password change (checklist §7 bullet 6 — "customer account/session
 * security flows").
 *
 * The action requires the *current* password before it will set a new one
 * and revokes every other session, so a stolen open browser can't be
 * locked in by someone who happens to be looking at it.
 */
export function PasswordForm() {
  const form = useZodForm(changePasswordSchema, {
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  async function onSubmit(values: ChangePasswordValues) {
    const result = await changePasswordAction(values);
    if (result.ok) {
      notify.success(result.data.message);
      form.reset({ currentPassword: "", newPassword: "" });
    } else {
      notify.error(result.message);
    }
  }

  return (
    <AppForm form={form} onSubmit={onSubmit}>
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
        <TextField
          form={form}
          name="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
        />
        <TextField
          form={form}
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          description="At least 10 characters. Every other device stays signed out after the change."
          required
        />
      </div>

      <FormActions>
        <SubmitButton pending={form.formState.isSubmitting}>
          Change password
        </SubmitButton>
      </FormActions>
    </AppForm>
  );
}
