"use client";

import { useRouter } from "next/navigation";

import { saveLoyaltySettings } from "@/lib/actions";
import {
  loyaltySettingsSchema,
  type LoyaltySettingsValues,
} from "@/lib/schemas";
import { notify } from "@/components/patterns/toast";
import {
  AppForm,
  FormActions,
  SubmitButton,
  TextAreaField,
  TextField,
  useZodForm,
} from "@/components/patterns/form";
import { Button } from "@/components/ui/button";

export function LoyaltySettingsForm({
  defaultValues,
  disabled = false,
}: {
  defaultValues: LoyaltySettingsValues;
  disabled?: boolean;
}) {
  const router = useRouter();
  const form = useZodForm(loyaltySettingsSchema, { defaultValues });

  async function onSubmit(values: LoyaltySettingsValues) {
    const result = await saveLoyaltySettings(values);
    if (result.ok) {
      notify.success(
        `“${result.data.programName}” saved. New rates apply to future transactions.`,
      );
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
            name="programName"
            label="Program name"
            description="Shown to customers in the portal and on receipts."
            required
            className="sm:col-span-2"
            disabled={disabled}
          />
          <TextField
            form={form}
            name="earnRate"
            label="Points per currency unit"
            type="number"
            inputMode="decimal"
            description="e.g. 5 → a $9 purchase earns 45 points."
            required
            disabled={disabled}
          />
          <TextField
            form={form}
            name="welcomeBonus"
            label="Welcome bonus (points)"
            type="number"
            inputMode="numeric"
            description="Awarded once when a customer joins."
            disabled={disabled}
          />
          <TextField
            form={form}
            name="pointsExpiryMonths"
            label="Points expire after (months)"
            type="number"
            inputMode="numeric"
            required
            disabled={disabled}
          />
          <TextField
            form={form}
            name="minPurchase"
            label="Minimum purchase to earn"
            type="number"
            inputMode="decimal"
            description="Smallest amount that qualifies for points."
            disabled={disabled}
          />
          <TextAreaField
            form={form}
            name="description"
            label="Program description"
            description="Short explanation customers see next to their balance."
            rows={3}
            className="sm:col-span-2"
            disabled={disabled}
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
            Save program
          </SubmitButton>
        </FormActions>
      </fieldset>
    </AppForm>
  );
}
