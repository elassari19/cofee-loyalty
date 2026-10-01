"use client";

import { useRouter } from "next/navigation";

import { saveProfileAction } from "@/features/customers/actions";
import {
  profileFormSchema,
  type ProfileFormValues,
} from "@/features/customers/schemas";
import {
  AppForm,
  FormActions,
  SubmitButton,
  TextField,
  useZodForm,
} from "@/components/patterns/form";
import { notify } from "@/components/patterns/toast";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Contact details editor (checklist §7 bullet 6).
 *
 * Email is rendered as a read-only value rather than a field: it is the
 * account's sign-in identity, so the form schema doesn't accept it and the
 * server would reject any attempt to send it — showing it as an input would
 * promise an edit the action can't perform.
 */
export function ProfileForm({
  defaultValues,
}: {
  defaultValues: { name: string; phone: string; email: string | null };
}) {
  const router = useRouter();
  const form = useZodForm(profileFormSchema, {
    defaultValues: { name: defaultValues.name, phone: defaultValues.phone },
  });

  async function onSubmit(values: ProfileFormValues) {
    const result = await saveProfileAction(values);
    if (result.ok) {
      notify.success(`Profile updated for ${result.data.name}.`);
      router.refresh();
    } else {
      notify.error(result.message);
    }
  }

  return (
    <AppForm form={form} onSubmit={onSubmit}>
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
        <TextField form={form} name="name" label="Full name" required />
        <TextField
          form={form}
          name="phone"
          label="Phone"
          type="tel"
          inputMode="tel"
          description="Optional — used for receipt text messages."
        />
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            value={defaultValues.email ?? ""}
            readOnly
            disabled
            autoComplete="email"
          />
          <FieldDescription>
            Your sign-in address — it doesn&apos;t change when you edit your
            profile.
          </FieldDescription>
        </Field>
      </div>

      <FormActions>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            form.reset({ name: defaultValues.name, phone: defaultValues.phone })
          }
          disabled={form.formState.isSubmitting}
        >
          Reset
        </Button>
        <SubmitButton pending={form.formState.isSubmitting}>
          Save profile
        </SubmitButton>
      </FormActions>
    </AppForm>
  );
}
