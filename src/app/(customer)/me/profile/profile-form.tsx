"use client";

import { useRouter } from "next/navigation";

import { saveOwnProfile } from "@/lib/actions";
import { profileSchema, type ProfileValues } from "@/lib/schemas";
import {
  AppForm,
  FormActions,
  SubmitButton,
  TextField,
  useZodForm,
} from "@/components/patterns/form";
import { notify } from "@/components/patterns/toast";
import { Button } from "@/components/ui/button";

export function ProfileForm({
  defaultValues,
}: {
  defaultValues: ProfileValues;
}) {
  const router = useRouter();
  const form = useZodForm(profileSchema, { defaultValues });

  async function onSubmit(values: ProfileValues) {
    const result = await saveOwnProfile(values);
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
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          required
        />
        <TextField
          form={form}
          name="phone"
          label="Phone"
          type="tel"
          inputMode="tel"
          description="Optional — used for receipt text messages."
          className="sm:col-span-2"
        />
      </div>

      <FormActions>
        <Button
          type="button"
          variant="outline"
          onClick={() => form.reset(defaultValues)}
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
