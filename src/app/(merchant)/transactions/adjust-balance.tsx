"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontalIcon } from "lucide-react";

import { adjustBalanceAction } from "@/features/loyalty/actions";
import {
  adjustmentSchema,
  type AdjustmentValues,
} from "@/features/loyalty/schemas";
import type { MemberOption } from "@/features/loyalty/transactions";
import { formatNumber, formatSignedPoints } from "@/lib/format";
import {
  AppForm,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
  useZodForm,
} from "@/components/patterns/form";
import { ConfirmDialog } from "@/components/patterns/confirm";
import { notify } from "@/components/patterns/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Manual balance adjustment (checklist §8 bullet 7, PRD §22).
 *
 * Rendered only for roles that hold `transactions.adjust` — and the server
 * checks that capability again, so hiding the button is convenience, not
 * security. Two deliberate stops:
 *
 *   1. the entry dialog, where the amount and the mandatory reason are
 *      validated by the same schema the server re-validates;
 *   2. `ConfirmDialog`, which states the exact consequence before anything is
 *      written — and, because actions return failures instead of throwing,
 *      is given an `onConfirm` that throws so a refused adjustment reports
 *      "nothing was changed" instead of pretending it succeeded.
 *
 * The idempotency key is minted when the dialog opens: a double-click posts
 * the same adjustment once.
 */

const EMPTY: AdjustmentValues = {
  membershipId: "",
  delta: 0,
  reason: "",
};

export function AdjustBalance({
  memberOptions,
  unitName,
}: {
  memberOptions: MemberOption[];
  unitName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState<
    (AdjustmentValues & { idempotencyKey: string }) | null
  >(null);
  const form = useZodForm(adjustmentSchema, { defaultValues: EMPTY });

  const selectedName = memberOptions.find(
    (option) => option.membershipId === form.watch("membershipId"),
  )?.name;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      form.reset(EMPTY);
      setPending(null);
    }
  }

  async function onSubmit(values: AdjustmentValues) {
    setPending({ ...values, idempotencyKey: crypto.randomUUID() });
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    if (!pending) return;
    const result = await adjustBalanceAction(pending);
    if (!result.ok) {
      // Rethrown so `ConfirmDialog` reports the refusal as "nothing changed".
      throw new Error(result.message);
    }
    notify.success(
      `${result.data.customerName}: ${formatSignedPoints(result.data.delta)} ${result.data.unitName} applied — new balance ${formatNumber(result.data.balance)}.`,
    );
    setConfirmOpen(false);
    setPending(null);
    setOpen(false);
    form.reset(EMPTY);
    router.refresh();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <SlidersHorizontalIcon aria-hidden="true" />
          Adjust balance
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust a balance</DialogTitle>
            <DialogDescription>
              Owner and manager only. The amount and reason are recorded as a
              permanent ledger entry — history is never edited in place.
            </DialogDescription>
          </DialogHeader>

          <AppForm form={form} onSubmit={onSubmit} className="gap-4">
            <SelectField
              form={form}
              name="membershipId"
              label="Member"
              placeholder="Select a member…"
              options={memberOptions.map((option) => ({
                value: option.membershipId,
                label: `${option.name} · ${formatNumber(option.balance)} ${unitName}`,
              }))}
              required
            />
            <TextField
              form={form}
              name="delta"
              label={`Amount (${unitName})`}
              type="number"
              inputMode="numeric"
              step={1}
              placeholder="50"
              description="Positive adds value, negative removes it. Whole units only."
              required
            />
            <TextAreaField
              form={form}
              name="reason"
              label="Reason"
              placeholder="Goodwill for a delayed order"
              description="Why this adjustment is being made — required, and shown in the audit trail."
              rows={3}
              required
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <SubmitButton pending={form.formState.isSubmitting}>
                Review adjustment
              </SubmitButton>
            </DialogFooter>
          </AppForm>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Apply this adjustment?"
        description={
          pending
            ? `${pending.delta > 0 ? "Add" : "Remove"} ${formatNumber(Math.abs(pending.delta))} ${unitName} ${pending.delta > 0 ? "to" : "from"} ${selectedName ?? "this member"}? Reason: “${pending.reason}”. This appends a ledger entry with your name on it.`
            : ""
        }
        confirmLabel="Apply adjustment"
        onConfirm={handleConfirm}
      />
    </>
  );
}
