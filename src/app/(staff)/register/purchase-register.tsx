"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScanLineIcon, UserRoundIcon } from "lucide-react";
import { z } from "zod";

import {
  lookupMemberAction,
  previewPurchaseAction,
  submitPurchaseAction,
} from "@/features/loyalty/actions";
import { purchaseEntrySchema } from "@/features/loyalty/schemas";
import type {
  MemberOption,
  PurchasePreview,
} from "@/features/loyalty/transactions";
import { formatNumber } from "@/lib/format";
import {
  AppForm,
  FormActions,
  SubmitButton,
  TextField,
  useZodForm,
} from "@/components/patterns/form";
import { notify } from "@/components/patterns/toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

/**
 * Purchase entry at the register (checklist §8 bullets 5–6, PRD §25).
 *
 * Four states, each one an explicit step the cashier can see:
 *
 *   1. **Identify** — scan/paste an identity payload (rate-limited lookup),
 *      or fall back to the member picker. The token itself is never echoed
 *      back by the server, and a miss is an inline hint rather than a toast.
 *   2. **Amount** — amount plus optional receipt reference, client-validated
 *      with the same schema the server re-validates.
 *   3. **Review** — the *server's* dry run: what will be awarded, from which
 *      rules, balance before → after. Nothing has been written yet.
 *   4. **Confirm** — posts with the idempotency key minted at review time, so
 *      a double-click or a retried response resolves to the same entry.
 *
 * The award is never calculated here: the client only ever displays what
 * `previewPurchase` / `recordPurchase` returned.
 */

interface SelectedMember {
  membershipId: string;
  name: string;
  balance: number;
}

type Stage = "identify" | "amount" | "review";

const ENTRY_SCHEMA = purchaseEntrySchema.extend({
  externalRef: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9._:-]*$/,
      "A receipt reference may only use letters, numbers, and . : _ -",
    )
    .max(120, "Keep the receipt reference to 120 characters or fewer."),
});

type EntryValues = z.infer<typeof ENTRY_SCHEMA>;

export function PurchaseRegister({
  memberOptions,
  unitName,
}: {
  memberOptions: MemberOption[];
  /** Display unit of the active program ("points" / "stamps"). */
  unitName: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("identify");
  const [member, setMember] = useState<SelectedMember | null>(null);
  const [preview, setPreview] = useState<PurchasePreview | null>(null);
  const [submission, setSubmission] = useState<{
    idempotencyKey: string;
    externalRef?: string;
  } | null>(null);
  const [payload, setPayload] = useState("");
  const [looking, setLooking] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const form = useZodForm(ENTRY_SCHEMA, { defaultValues: { externalRef: "" } });

  function chooseMember(option: SelectedMember) {
    setMember(option);
    setPreview(null);
    setSubmission(null);
    setStage("amount");
  }

  function startOver() {
    setStage("identify");
    setMember(null);
    setPreview(null);
    setSubmission(null);
    setPayload("");
    form.reset({ externalRef: "" });
  }

  async function handleLookup(event: React.FormEvent) {
    event.preventDefault();
    const value = payload.trim();
    if (!value || looking) return;
    setLooking(true);
    try {
      const result = await lookupMemberAction(value);
      if (!result.ok) {
        notify.error(result.message);
        return;
      }
      if (!result.data) {
        notify.error(
          "No member matched that card. Check the code or pick the member below.",
        );
        return;
      }
      chooseMember(result.data);
      setPayload("");
    } finally {
      setLooking(false);
    }
  }

  async function handlePreview(values: EntryValues) {
    if (!member) return;
    const result = await previewPurchaseAction({
      membershipId: member.membershipId,
      amount: values.amount,
    });
    if (!result.ok) {
      notify.error(result.message);
      return;
    }
    setPreview(result.data);
    setSubmission({
      idempotencyKey: crypto.randomUUID(),
      externalRef: values.externalRef || undefined,
    });
    setStage("review");
  }

  async function handleConfirm() {
    if (!member || !preview || !submission || confirming) return;
    setConfirming(true);
    try {
      const result = await submitPurchaseAction({
        membershipId: member.membershipId,
        amount: preview.amount,
        currency: preview.currency,
        idempotencyKey: submission.idempotencyKey,
        externalRef: submission.externalRef,
      });
      if (!result.ok) {
        notify.error(result.message);
        return;
      }
      notify.success(
        `${result.data.customerName} earned ${formatNumber(result.data.delta)} ${result.data.unitName} — new balance ${formatNumber(result.data.balance)}.`,
      );
      startOver();
      router.refresh();
    } finally {
      setConfirming(false);
    }
  }

  const title =
    stage === "identify"
      ? "Identify the member"
      : stage === "amount"
        ? "Record a purchase"
        : "Review before awarding";

  const description =
    stage === "identify"
      ? "Scan the member's card or QR code, or pick them from the list. The server resolves the code to a member of this store only."
      : stage === "amount"
        ? "Enter what they spent. The award is calculated by the server from this store's active rules — nothing is written until you review and confirm."
        : "This is exactly what will be recorded. Confirm to append the ledger entry and update the balance.";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanLineIcon aria-hidden="true" className="size-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {member ? (
          <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <UserRoundIcon
                aria-hidden="true"
                className="text-muted-foreground size-4"
              />
              <span className="truncate font-medium">{member.name}</span>
              <span className="text-muted-foreground text-sm tabular-nums">
                {formatNumber(member.balance)} {unitName}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={
                stage === "identify" ? startOver : () => setStage("identify")
              }
            >
              Change member
            </Button>
          </div>
        ) : null}

        {stage === "identify" ? (
          <>
            <form className="flex flex-col gap-5" onSubmit={handleLookup}>
              <Field>
                <FieldLabel htmlFor="member-payload">
                  Card or QR code
                </FieldLabel>
                <Input
                  id="member-payload"
                  value={payload}
                  onChange={(event) => setPayload(event.target.value)}
                  placeholder="Paste the code from the member's card"
                  autoComplete="off"
                  autoFocus
                />
                <FieldDescription>
                  Codes are checked against this store only, and the code itself
                  is never stored or echoed back.
                </FieldDescription>
              </Field>
              <FormActions>
                <Button
                  type="submit"
                  disabled={looking || payload.trim().length === 0}
                  aria-busy={looking}
                >
                  {looking ? (
                    <Spinner className="size-3.5" aria-hidden="true" />
                  ) : null}
                  {looking ? "Finding member…" : "Find member"}
                </Button>
              </FormActions>
            </form>

            <div className="flex flex-col gap-2 border-t pt-5">
              <FieldLabel htmlFor="member-picker">Or pick a member</FieldLabel>
              <Select
                value=""
                onValueChange={(value) => {
                  const option = memberOptions.find(
                    (candidate) => candidate.membershipId === value,
                  );
                  if (option) chooseMember(option);
                }}
                items={Object.fromEntries(
                  memberOptions.map((option) => [
                    option.membershipId,
                    `${option.name} · ${formatNumber(option.balance)} ${unitName}`,
                  ]),
                )}
              >
                <SelectTrigger id="member-picker" className="w-full">
                  <SelectValue placeholder="Select a member…" />
                </SelectTrigger>
                <SelectContent>
                  {memberOptions.map((option) => (
                    <SelectItem
                      key={option.membershipId}
                      value={option.membershipId}
                    >
                      {option.name} · {formatNumber(option.balance)} {unitName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {memberOptions.length > 0
                  ? "Use the picker when the card will not scan."
                  : "No members yet — a customer has to join before a purchase can be recorded."}
              </FieldDescription>
            </div>
          </>
        ) : null}

        {stage === "amount" && member ? (
          <AppForm form={form} onSubmit={handlePreview}>
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <TextField
                form={form}
                name="amount"
                label="Purchase amount"
                type="number"
                inputMode="decimal"
                placeholder="9.00"
                description="Positive amount, up to two decimals. The server checks it against the program's minimum purchase."
                className="sm:col-span-2"
                required
              />
              <TextField
                form={form}
                name="externalRef"
                label="Receipt reference"
                placeholder="Optional — receipt or POS id"
                description="Recorded on the entry and unique per store, so a retried submission is recognised."
                className="sm:col-span-2"
              />
            </div>
            <FormActions>
              <SubmitButton
                pending={form.formState.isSubmitting}
                pendingLabel="Calculating…"
              >
                Preview award
              </SubmitButton>
            </FormActions>
          </AppForm>
        ) : null}

        {stage === "review" && preview && member && submission ? (
          <div className="flex flex-col gap-4">
            <dl className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs">Member</dt>
                <dd className="font-medium">{preview.customerName}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs">Purchase</dt>
                <dd className="font-medium tabular-nums">
                  {preview.amount.toFixed(2)} {preview.currency}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs">Award</dt>
                <dd className="font-medium tabular-nums">
                  {preview.qualified
                    ? `+${formatNumber(preview.delta)} ${preview.unitName}`
                    : "No award"}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs">Balance after</dt>
                <dd className="font-medium tabular-nums">
                  {formatNumber(preview.balanceAfter)}{" "}
                  <span className="text-muted-foreground font-normal">
                    (was {formatNumber(preview.balanceBefore)})
                  </span>
                </dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:col-span-2">
                <dt className="text-muted-foreground text-xs">Rule applied</dt>
                <dd className="text-sm">
                  {preview.message ??
                    `${preview.programName} · rules v${preview.ruleVersion}`}
                </dd>
              </div>
            </dl>

            <FormActions>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStage("amount")}
                disabled={confirming}
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={confirming || !preview.qualified}
                aria-busy={confirming}
              >
                {confirming ? (
                  <Spinner className="size-3.5" aria-hidden="true" />
                ) : null}
                {confirming ? "Recording…" : "Confirm and award"}
              </Button>
            </FormActions>
            {preview.qualified ? null : (
              <p className="text-muted-foreground text-sm">
                This purchase does not earn anything under the current rules, so
                there is nothing to record.
              </p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
