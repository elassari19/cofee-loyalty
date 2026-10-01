"use client";

import { useRouter } from "next/navigation";

import {
  createBusinessAction,
  saveBusinessProfileAction,
} from "@/features/merchants/actions";
import {
  MERCHANT_CATEGORIES,
  MERCHANT_CATEGORY_LABELS,
  MERCHANT_CURRENCIES,
  MERCHANT_TIMEZONES,
  businessProfileSchema,
  type BusinessProfileValues,
} from "@/features/merchants/schemas";
import { report } from "@/auth/client-actions";
import { notify } from "@/components/patterns/toast";
import {
  AppForm,
  FormActions,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
  useZodForm,
} from "@/components/patterns/form";

/**
 * Business profile form (checklist §6 bullet 1) shared by the onboarding
 * registration step and the settings page — one schema, one layout, two
 * actions: `create` provisions a new tenant (and redirects into the wizard),
 * `edit` updates the current one in place.
 *
 * The server re-validates against the same schema; a crafted POST still gets
 * rejected there, and any failure is surfaced as a toast with no navigation,
 * so typed values are never lost.
 */

const TIMEZONE_OPTIONS = MERCHANT_TIMEZONES.map((timezone) => ({
  value: timezone,
  label: timezone,
}));

export function BusinessForm({
  mode,
  defaultValues,
  advance = false,
  disabled = false,
  onSaved,
}: {
  mode: "create" | "edit";
  defaultValues: BusinessProfileValues;
  /**
   * Continue the wizard: push to the `nextPath` the action returned.
   * The settings page leaves this off and just refreshes in place.
   */
  advance?: boolean;
  /** Read-only rendering for roles without `merchant.write` (settings page). */
  disabled?: boolean;
  /** Called after an *edit* save with the next wizard path (if any). */
  onSaved?: (result: { nextPath: string; changedFields: string[] }) => void;
}) {
  const router = useRouter();
  const form = useZodForm(businessProfileSchema, { defaultValues });

  // An existing profile can hold a zone the curated list doesn't include;
  // keep it selectable so editing never silently rewrites the timezone.
  const timezone = form.watch("timezone");
  const timezoneOptions = TIMEZONE_OPTIONS.some(
    (option) => option.value === timezone,
  )
    ? TIMEZONE_OPTIONS
    : [...TIMEZONE_OPTIONS, { value: timezone, label: timezone }];

  async function onSubmit(values: BusinessProfileValues) {
    if (disabled) return;
    if (mode === "create") {
      // Registration redirects into the wizard; `report` swallows the
      // navigation and toasts anything that came back as a failure.
      await report(() => createBusinessAction(values));
      return;
    }

    const result = await saveBusinessProfileAction(values);
    if (!result.ok) {
      notify.error(result.message);
      return;
    }
    if (result.data.changedFields.length === 0) {
      notify.info("Nothing changed — the profile already looked like that.");
    } else {
      notify.success("Business profile saved.");
    }
    onSaved?.(result.data);
    if (advance) router.push(result.data.nextPath);
    else router.refresh();
  }

  return (
    <AppForm form={form} onSubmit={onSubmit}>
      <fieldset disabled={disabled} className="contents">
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          <TextField
            form={form}
            name="name"
            label="Business name"
            description="Customers see this name in the portal and on receipts."
            required
            className="sm:col-span-2"
          />
          <SelectField
            form={form}
            name="category"
            label="Category"
            required
            options={MERCHANT_CATEGORIES.map((category) => ({
              value: category,
              label: MERCHANT_CATEGORY_LABELS[category],
            }))}
          />
          <SelectField
            form={form}
            name="currency"
            label="Currency"
            description="The currency customers are charged in."
            required
            options={MERCHANT_CURRENCIES.map((currency) => ({
              value: currency,
              label: currency,
            }))}
          />
          <TextField
            form={form}
            name="email"
            label="Contact email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
          />
          <TextField
            form={form}
            name="phone"
            label="Phone"
            type="tel"
            inputMode="tel"
            description="Optional — shown to customers who need help."
          />
          <TextAreaField
            form={form}
            name="address"
            label="Address"
            rows={2}
            required
            className="sm:col-span-2"
          />
          <SelectField
            form={form}
            name="timezone"
            label="Timezone"
            description="Campaign windows and expiry calculations use this zone."
            options={timezoneOptions}
            required
            className="sm:col-span-2"
          />
          <TextField
            form={form}
            name="website"
            label="Website"
            type="url"
            inputMode="url"
            placeholder="https://example.com"
            description="Optional."
          />
          <TextField
            form={form}
            name="logoUrl"
            label="Logo image URL"
            type="url"
            inputMode="url"
            placeholder="https://example.com/logo.png"
            description="Optional."
          />
          <TextAreaField
            form={form}
            name="description"
            label="About the business"
            rows={3}
            description="Shown next to your program in the customer portal."
            className="sm:col-span-2"
          />
        </div>

        <FormActions>
          <SubmitButton pending={form.formState.isSubmitting}>
            {mode === "create" ? "Create business & continue" : "Save profile"}
          </SubmitButton>
        </FormActions>
      </fieldset>
    </AppForm>
  );
}
