"use client";

import { useRouter } from "next/navigation";

import { saveBusinessSettings } from "@/lib/actions";
import {
  businessSettingsSchema,
  type BusinessSettingsValues,
} from "@/lib/schemas";
import {
  AppForm,
  FormActions,
  SelectField,
  SubmitButton,
  SwitchField,
  TextAreaField,
  TextField,
  useZodForm,
} from "@/components/patterns/form";
import { notify } from "@/components/patterns/toast";
import { Button } from "@/components/ui/button";

const TIMEZONES = [
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
];

export function BusinessSettingsForm({
  defaultValues,
  disabled = false,
}: {
  defaultValues: BusinessSettingsValues;
  disabled?: boolean;
}) {
  const router = useRouter();
  const form = useZodForm(businessSettingsSchema, { defaultValues });

  async function onSubmit(values: BusinessSettingsValues) {
    const result = await saveBusinessSettings(values);
    if (result.ok) {
      notify.success(`Business settings saved for ${result.data.storeName}.`);
      router.refresh();
    } else {
      notify.error(result.message);
    }
  }

  return (
    <AppForm form={form} onSubmit={onSubmit}>
      <fieldset disabled={disabled} className="contents">
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          <TextField
            form={form}
            name="storeName"
            label="Store name"
            required
            disabled={disabled}
          />
          <TextField
            form={form}
            name="supportEmail"
            label="Support email"
            type="email"
            inputMode="email"
            description="Shown on receipts and customer emails."
            required
            disabled={disabled}
          />
          <SelectField
            form={form}
            name="timezone"
            label="Timezone"
            description="Campaign start and end boundaries use this zone."
            options={TIMEZONES.map((timezone) => ({
              value: timezone,
              label: timezone,
            }))}
            disabled={disabled}
            className="sm:col-span-2"
          />
          <TextAreaField
            form={form}
            name="receiptFooter"
            label="Receipt footer"
            rows={2}
            className="sm:col-span-2"
            disabled={disabled}
          />
          <SwitchField
            form={form}
            name="loyaltyEnabled"
            label="Loyalty program enabled"
            description="Turn off to pause earning and redemption across the store."
            disabled={disabled}
            className="sm:col-span-2"
          />
        </div>

        <FormActions>
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset(defaultValues)}
            disabled={disabled || form.formState.isSubmitting}
          >
            Reset
          </Button>
          <SubmitButton
            pending={form.formState.isSubmitting}
            disabled={disabled}
          >
            Save settings
          </SubmitButton>
        </FormActions>
      </fieldset>
    </AppForm>
  );
}
