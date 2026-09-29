"use client";

import { useRouter } from "next/navigation";

import { recordPurchaseAction } from "@/lib/actions";
import { purchaseSchema, type PurchaseValues } from "@/lib/schemas";
import { formatNumber } from "@/lib/format";
import {
  AppForm,
  FormActions,
  SelectField,
  SubmitButton,
  TextField,
  useZodForm,
} from "@/components/patterns/form";
import { notify } from "@/components/patterns/toast";

export function PurchaseForm({
  customers,
  earnRate,
  minPurchase,
}: {
  customers: { id: string; name: string }[];
  earnRate: number;
  minPurchase: number;
}) {
  const router = useRouter();
  const form = useZodForm(purchaseSchema, {
    defaultValues: { customerId: "" },
  });
  const amount = form.watch("amount");
  const numericAmount = Number(amount);
  const preview =
    Number.isFinite(numericAmount) && numericAmount > 0
      ? Math.round(numericAmount * earnRate)
      : null;

  async function onSubmit(values: PurchaseValues) {
    const result = await recordPurchaseAction(values);
    if (result.ok) {
      notify.success(
        `${result.data.customerName} earned ${formatNumber(result.data.pointsEarned)} points — new balance ${formatNumber(result.data.balance)}.`,
      );
      form.reset({ customerId: values.customerId });
      router.refresh();
    } else {
      notify.error(result.message);
    }
  }

  return (
    <AppForm form={form} onSubmit={onSubmit}>
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
        <SelectField
          form={form}
          name="customerId"
          label="Customer"
          placeholder="Select customer…"
          options={customers.map((customer) => ({
            value: customer.id,
            label: customer.name,
          }))}
          className="sm:col-span-2"
        />
        <TextField
          form={form}
          name="amount"
          label="Purchase amount"
          type="number"
          inputMode="decimal"
          placeholder="9.00"
          description={
            preview === null
              ? `Earns ${formatNumber(earnRate)} points per $1 (min $${formatNumber(minPurchase)}).`
              : `This purchase awards ${formatNumber(preview)} points.`
          }
          required
        />
      </div>

      <FormActions>
        <SubmitButton pending={form.formState.isSubmitting}>
          Award points
        </SubmitButton>
      </FormActions>
    </AppForm>
  );
}
