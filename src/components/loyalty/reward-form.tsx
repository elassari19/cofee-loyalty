"use client";

import { useRouter } from "next/navigation";

import { createRewardAction } from "@/features/rewards/actions";
import {
  emptyRewardFormValues,
  rewardFormSchema,
  type RewardFormValues,
} from "@/features/rewards/schemas";
import { notify } from "@/components/patterns/toast";
import {
  AppForm,
  FormActions,
  SubmitButton,
  TextAreaField,
  TextField,
  useZodForm,
} from "@/components/patterns/form";

/**
 * Initial-reward form (checklist §6 bullet 6). The reward's unit is decided
 * on the server from the merchant's program, so the label here is display
 * only — a crafted payload still lands in the program's own unit.
 */
export function RewardForm({
  unitLabel,
  submitLabel = "Create reward & continue",
  advance = true,
  onSaved,
}: {
  /** "points" or "stamps" — read from the stored program server-side. */
  unitLabel: string;
  submitLabel?: string;
  /** Continue the wizard: push to the `nextPath` the action returned. */
  advance?: boolean;
  onSaved?: (result: { nextPath: string; rewardId: string }) => void;
}) {
  const router = useRouter();
  const form = useZodForm(rewardFormSchema, {
    defaultValues: emptyRewardFormValues(),
  });

  async function onSubmit(values: RewardFormValues) {
    const result = await createRewardAction(values);
    if (!result.ok) {
      notify.error(result.message);
      return;
    }
    notify.success(
      `“${values.name}” created — customers can redeem it for ${result.data.cost} ${unitLabel}.`,
    );
    onSaved?.({
      nextPath: result.data.nextPath,
      rewardId: result.data.rewardId,
    });
    if (advance) router.push(result.data.nextPath);
    else router.refresh();
  }

  return (
    <AppForm form={form} onSubmit={onSubmit}>
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
        <TextField
          form={form}
          name="name"
          label="Reward name"
          description='What customers unlock, e.g. "Free pastry".'
          required
          className="sm:col-span-2"
        />
        <TextField
          form={form}
          name="cost"
          label={`Cost in ${unitLabel}`}
          type="number"
          inputMode="numeric"
          min={1}
          description={`Whole number of ${unitLabel} — at least 1.`}
          required
        />
        <TextField
          form={form}
          name="expiresAt"
          label="Available until"
          type="date"
          description="Leave blank if it never expires."
        />
        <TextField
          form={form}
          name="redemptionLimit"
          label="Total redemption limit"
          type="number"
          inputMode="numeric"
          min={1}
          description="Blank means unlimited — how many times it may be redeemed in total."
        />
        <TextAreaField
          form={form}
          name="description"
          label="Description"
          rows={2}
          description="Shown next to the reward in the portal."
        />
        <TextAreaField
          form={form}
          name="terms"
          label="Terms"
          rows={2}
          description="Fine print, e.g. “One per customer per month”."
          className="sm:col-span-2"
        />
      </div>

      <FormActions>
        <SubmitButton pending={form.formState.isSubmitting}>
          {submitLabel}
        </SubmitButton>
      </FormActions>
    </AppForm>
  );
}
