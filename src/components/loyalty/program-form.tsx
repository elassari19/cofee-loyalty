"use client";

import { useFieldArray } from "react-hook-form";
import { useRouter } from "next/navigation";
import { PlusIcon, XIcon } from "lucide-react";

import { saveProgramAction } from "@/features/loyalty/actions";
import {
  ROUNDING_MODES,
  emptyProgramFormValues,
  programFormSchema,
  type ProgramFormValues,
} from "@/features/loyalty/schemas";
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
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

/**
 * Loyalty program form (checklist §6 bullets 2–5).
 *
 * One flat form serves both models. Choosing a model *switches which fields
 * exist*: the other model's inputs are unmounted and cleared, so the payload
 * can only ever carry one rule set — and the server-side `superRefine` would
 * reject it anyway if it didn't.
 *
 * When the program is already active (or rewards are priced in its unit) the
 * model cards lock: rules stay editable, the model does not — matching the
 * conflict the service throws on a crafted request.
 */

const ROUNDING_LABELS: Record<(typeof ROUNDING_MODES)[number], string> = {
  FLOOR: "Round down (12.4 → 12)",
  ROUND: "Round to nearest (12.5 → 13)",
  CEIL: "Round up (12.1 → 13)",
};

const MODEL_OPTIONS = [
  {
    value: "POINTS" as const,
    title: "Points",
    description:
      "Customers earn points per amount spent and redeem thresholds.",
  },
  {
    value: "STAMPS" as const,
    title: "Stamp card",
    description:
      "A stamp per qualifying purchase; a full card unlocks the reward.",
  },
];

export function ProgramForm({
  defaultValues,
  typeLocked = false,
  submitLabel = "Save program rules",
  advance = false,
  disabled = false,
  onSaved,
}: {
  defaultValues: ProgramFormValues;
  typeLocked?: boolean;
  submitLabel?: string;
  /** Continue the wizard: push to the `nextPath` the action returned. */
  advance?: boolean;
  /** Read-only rendering for roles without `loyalty.write` (settings). */
  disabled?: boolean;
  onSaved?: (result: { nextPath: string; ruleVersion: number }) => void;
}) {
  const router = useRouter();
  const form = useZodForm(programFormSchema, { defaultValues });
  const type = form.watch("type");
  const thresholds = useFieldArray({
    control: form.control,
    name: "redemptionThresholds",
  });

  /** Keeps only the selected model's fields in the form state. */
  function selectModel(next: "POINTS" | "STAMPS") {
    if (next === "STAMPS") {
      form.setValue("redemptionThresholds", [], { shouldValidate: false });
      form.setValue("pointsPerEuro", undefined);
      form.setValue("rounding", undefined);
      form.setValue("requiredStamps", 10);
      form.setValue("stampsPerPurchase", 1);
      form.setValue("maximumStampsPerTransaction", 1);
    } else {
      form.setValue("requiredStamps", undefined);
      form.setValue("stampsPerPurchase", undefined);
      form.setValue("maximumStampsPerTransaction", undefined);
      form.setValue("pointsPerEuro", 1);
      form.setValue("rounding", "FLOOR");
      if ((form.getValues("redemptionThresholds") ?? []).length === 0) {
        form.setValue(
          "redemptionThresholds",
          emptyProgramFormValues("POINTS").redemptionThresholds,
        );
      }
    }
    const unit = form.getValues("unitName");
    if (unit === "points" || unit === "stamps" || unit === "") {
      form.setValue("unitName", next === "POINTS" ? "points" : "stamps");
    }
    for (const field of [
      "type",
      "pointsPerEuro",
      "rounding",
      "requiredStamps",
      "stampsPerPurchase",
      "maximumStampsPerTransaction",
    ] as const) {
      form.clearErrors(field);
    }
  }

  async function onSubmit(values: ProgramFormValues) {
    if (disabled) return;
    const result = await saveProgramAction(values);
    if (!result.ok) {
      notify.error(result.message);
      return;
    }
    notify.success(
      `Rules saved — version ${result.data.ruleVersion}. New rules apply to future transactions only.`,
    );
    onSaved?.(result.data);
    if (advance) router.push(result.data.nextPath);
    else router.refresh();
  }

  const arrayError = messageOf(form.formState.errors.redemptionThresholds);

  return (
    <AppForm form={form} onSubmit={onSubmit}>
      <fieldset
        disabled={disabled || form.formState.isSubmitting}
        className="contents"
      >
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">
            Loyalty model
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          </div>
          <p className="text-muted-foreground text-sm">
            Pick exactly one model.{" "}
            {typeLocked
              ? "It's locked because this program is already active or has rewards — the rules can still change."
              : "You can switch while setting up; switching resets the other model's fields."}
          </p>
          <RadioGroup
            value={type}
            onValueChange={(value) => {
              if (value === type || typeLocked) return;
              form.setValue("type", value);
              selectModel(value);
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            {MODEL_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="has-data-checked:border-primary has-data-checked:bg-primary/5 has-[:focus-visible]:ring-ring/50 flex cursor-pointer gap-3 rounded-lg border p-4 has-[:focus-visible]:ring-[3px]"
              >
                <RadioGroupItem
                  value={option.value}
                  disabled={typeLocked}
                  className="mt-0.5"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">{option.title}</span>
                  <span className="text-muted-foreground text-xs leading-relaxed">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
          {messageOf(form.formState.errors.type) ? (
            <FieldError role="alert">
              {messageOf(form.formState.errors.type)}
            </FieldError>
          ) : null}
        </div>

        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          <TextField
            form={form}
            name="name"
            label="Program name"
            description="Shown to customers in the portal and on receipts."
            required
            className="sm:col-span-2"
          />
          <TextField
            form={form}
            name="unitName"
            label="Unit name"
            description='What customers see: "points", "stamps", "beans"…'
            required
          />
          <TextField
            form={form}
            name="minimumPurchase"
            label="Minimum purchase to qualify"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            description="0 means every purchase qualifies."
            required
          />
          <TextField
            form={form}
            name="expiryMonths"
            label="Value expires after (months)"
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            description="Leave blank if value never expires."
          />
          <TextAreaField
            form={form}
            name="description"
            label="Program description"
            description="A sentence customers read next to their balance."
            rows={2}
            className="sm:col-span-2"
          />

          {type === "POINTS" ? (
            <>
              <TextField
                form={form}
                name="pointsPerEuro"
                label="Points per currency unit"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0.01}
                description="e.g. 1 → a 9.00 purchase earns 9 points."
                required
              />
              <SelectField
                form={form}
                name="rounding"
                label="Rounding"
                description="How partial points are rounded."
                options={ROUNDING_MODES.map((mode) => ({
                  value: mode,
                  label: ROUNDING_LABELS[mode],
                }))}
                required
              />
            </>
          ) : (
            <>
              <TextField
                form={form}
                name="stampsPerPurchase"
                label="Stamps per qualifying purchase"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                required
              />
              <TextField
                form={form}
                name="maximumStampsPerTransaction"
                label="Max stamps per transaction"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                description="Caps stacking on large single orders."
                required
              />
              <TextField
                form={form}
                name="requiredStamps"
                label="Stamps to complete a card"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                required
                className="sm:col-span-2"
              />
            </>
          )}
        </div>

        {type === "POINTS" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  Redemption thresholds
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                </span>
                <FieldDescription>
                  What customers can unlock, and what it costs.
                </FieldDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={thresholds.fields.length >= 6}
                onClick={() => thresholds.append({ cost: 100, label: "" })}
              >
                <PlusIcon aria-hidden="true" />
                Add threshold
              </Button>
            </div>

            {thresholds.fields.map((row, index) => {
              const costError =
                form.formState.errors.redemptionThresholds?.[index]?.cost
                  ?.message;
              const labelError =
                form.formState.errors.redemptionThresholds?.[index]?.label
                  ?.message;
              return (
                <div
                  key={row.id}
                  className="grid gap-x-3 gap-y-2 sm:grid-cols-[10rem_1fr_auto]"
                >
                  <Field>
                    <FieldLabel htmlFor={`${row.id}-cost`}>
                      Cost ({form.watch("unitName") || "points"})
                    </FieldLabel>
                    <Input
                      id={`${row.id}-cost`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      aria-invalid={costError ? true : undefined}
                      {...form.register(`redemptionThresholds.${index}.cost`)}
                    />
                    <FieldError>{costError}</FieldError>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${row.id}-label`}>Unlocks</FieldLabel>
                    <Input
                      id={`${row.id}-label`}
                      placeholder="Free pastry"
                      aria-invalid={labelError ? true : undefined}
                      {...form.register(`redemptionThresholds.${index}.label`)}
                    />
                    <FieldError>{labelError}</FieldError>
                  </Field>
                  <div className="flex items-end pb-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove threshold ${index + 1}`}
                      disabled={thresholds.fields.length <= 1}
                      onClick={() => thresholds.remove(index)}
                    >
                      <XIcon aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {arrayError ? (
              <FieldError role="alert">{arrayError}</FieldError>
            ) : null}
          </div>
        ) : null}

        <FormActions>
          <SubmitButton pending={form.formState.isSubmitting}>
            {submitLabel}
          </SubmitButton>
        </FormActions>
      </fieldset>
    </AppForm>
  );
}

function messageOf(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return undefined;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}
