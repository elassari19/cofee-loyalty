"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ScanLineIcon } from "lucide-react";

import {
  completeRedemptionAction,
  verifyRedemptionAction,
} from "@/features/redemptions/actions";
import type { RedemptionView } from "@/features/redemptions/service";
import type { RedemptionStatus } from "@/db/entities/enums";
import { formatDateTime, formatNumber } from "@/lib/format";
import { ConfirmButton } from "@/components/patterns/confirm";
import { StatusBadge } from "@/components/patterns/status-badge";
import { notify } from "@/components/patterns/toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Counter verification and completion (checklist §9 bullets 6–8).
 *
 * Two explicit steps, deliberately never merged:
 *
 *   **Verify** — looks the code up and stamps *who checked it*. Nothing is
 *   spent, so a cashier can check a code as often as they like; the panel
 *   says so on screen because that is the whole point of the split.
 *   **Redeem** — the single-use step, behind a confirmation that states the
 *   consequence. It is idempotent server-side, so a double click resolves to
 *   one completion instead of a double spend.
 *
 * Every failure the server reports is a *result*, not an exception, so a
 * refusal ("expired", "replaced", rate limited) lands as a toast plus a
 * refreshed view rather than a dead panel.
 */

const STATUS_PRESENTATION: Record<
  RedemptionStatus,
  { status: string; label: string }
> = {
  ISSUED: { status: "draft", label: "Not verified yet" },
  VERIFIED: { status: "active", label: "Verified" },
  REDEEMED: { status: "redeem", label: "Redeemed" },
  EXPIRED: { status: "disabled", label: "Expired" },
  CANCELLED: { status: "disabled", label: "Replaced" },
};

interface CompletedSummary {
  redemptionId: string;
  rewardName: string;
  customerName: string;
  unitName: string;
  cost: number;
  balance: number;
}

export function RedeemPanel() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<RedemptionView | null>(null);
  const [completed, setCompleted] = useState<CompletedSummary | null>(null);

  function reset() {
    setView(null);
    setCompleted(null);
    setCode("");
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setCompleted(null);
    const result = await verifyRedemptionAction({ code });
    setBusy(false);

    if (!result.ok) {
      setView(null);
      notify.error(result.message);
      return;
    }
    setView(result.data);
    if (result.data.changed === "expired") {
      notify.error(
        "That code had expired — its value went back to the member.",
      );
    } else if (result.data.changed === "verified") {
      notify.success("Code verified. Nothing has been spent yet.");
    }
  }

  /**
   * Completes a verified code. On a refusal the panel re-reads the code so
   * the cashier sees the state that caused it (expired, replaced, spent) —
   * safe, because the read only transitions a code that was `ISSUED`, and the
   * button only ever appears for a `VERIFIED` one.
   */
  async function handleComplete(): Promise<void> {
    if (!view) throw new Error("Verify a code first.");
    setBusy(true);
    const result = await completeRedemptionAction({
      redemptionId: view.redemptionId,
    });

    if (result.ok && result.data.kind === "completed") {
      setCompleted(result.data);
      setView(null);
      setCode("");
      setBusy(false);
      router.refresh();
      return;
    }

    // Anything else — expired, replaced, not verified, rate limited — is a
    // refusal, and the panel re-reads the code so the cashier sees why.
    const staleStatus = view.status;
    const again = await verifyRedemptionAction({ code });
    setView(again.ok && staleStatus !== "ISSUED" ? again.data : null);
    setBusy(false);
    // Rethrown so `ConfirmButton` reports the refusal as "nothing changed".
    throw new Error(
      result.ok ? "That code could not be redeemed." : result.message,
    );
  }

  const presentation = view ? STATUS_PRESENTATION[view.displayStatus] : null;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Code</CardTitle>
          <CardDescription>
            Type or scan the code the customer shows you — case, spaces and
            hyphens don&apos;t matter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleVerify}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <div className="flex-1">
              <Label htmlFor="redemption-code" className="sr-only">
                Redemption code
              </Label>
              <Input
                id="redemption-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="XXXXX-XXXXX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                className="h-11 font-mono text-lg tracking-[0.2em] uppercase"
              />
            </div>
            <Button
              type="submit"
              disabled={busy || code.trim().length < 4}
              className="h-11"
            >
              <ScanLineIcon aria-hidden="true" />
              {busy ? "Checking…" : "Verify"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {completed ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckIcon aria-hidden="true" className="size-5" />
              Redeemed
            </CardTitle>
            <CardDescription>
              “{completed.rewardName}” for {completed.customerName} —{" "}
              {formatNumber(completed.cost)} {completed.unitName} spent.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm">
              New balance:{" "}
              <span className="font-medium tabular-nums">
                {formatNumber(completed.balance)} {completed.unitName}
              </span>
            </p>
            <Button variant="outline" onClick={reset}>
              Redeem another code
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {view && presentation ? (
        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="min-w-0">{view.rewardName}</span>
              <StatusBadge
                status={presentation.status}
                label={presentation.label}
              />
            </CardTitle>
            <CardDescription>
              {view.rewardDescription ?? "Reward verification"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex items-baseline justify-between gap-2 sm:block">
                <dt className="text-muted-foreground">Customer</dt>
                <dd className="font-medium">{view.customerName}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 sm:block">
                <dt className="text-muted-foreground">Cost</dt>
                <dd className="font-medium tabular-nums">
                  {formatNumber(view.cost)} {view.unitName}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 sm:block">
                <dt className="text-muted-foreground">Member balance</dt>
                <dd className="font-medium tabular-nums">
                  {formatNumber(view.balance)} {view.unitName}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 sm:block">
                <dt className="text-muted-foreground">Valid until</dt>
                <dd>{view.expiresAt ? formatDateTime(view.expiresAt) : "—"}</dd>
              </div>
              {view.verifiedAt ? (
                <div className="flex items-baseline justify-between gap-2 sm:block">
                  <dt className="text-muted-foreground">Verified</dt>
                  <dd>{formatDateTime(view.verifiedAt)}</dd>
                </div>
              ) : null}
              {view.redeemedAt ? (
                <div className="flex items-baseline justify-between gap-2 sm:block">
                  <dt className="text-muted-foreground">Redeemed</dt>
                  <dd>{formatDateTime(view.redeemedAt)}</dd>
                </div>
              ) : null}
            </dl>

            {view.changed === "verified" ? (
              <p className="text-muted-foreground text-sm">
                Verified — recording you as the checker. This has not spent
                anything yet.
              </p>
            ) : null}
            {view.status === "ISSUED" ? (
              <p className="text-muted-foreground text-sm">
                This code has not been verified yet — verify it to record who
                checked it.
              </p>
            ) : null}
            {view.displayStatus === "EXPIRED" || view.status === "CANCELLED" ? (
              <p className="text-destructive text-sm">
                This code can no longer be redeemed
                {view.status === "CANCELLED"
                  ? " — the customer replaced it."
                  : " — it expired, and the value went back to the member."}
              </p>
            ) : null}
            {view.status === "REDEEMED" ? (
              <p className="text-sm">
                Already redeemed
                {view.redeemedAt
                  ? ` on ${formatDateTime(view.redeemedAt)}`
                  : ""}
                . Codes are single-use.
              </p>
            ) : null}

            {view.redeemable ? (
              <ConfirmButton
                destructive
                title={`Redeem “${view.rewardName}”?`}
                description={`This spends ${formatNumber(view.cost)} ${view.unitName} from ${view.customerName}'s balance and marks the code as used. It cannot be undone from here.`}
                confirmLabel="Redeem reward"
                onConfirm={handleComplete}
                successMessage={`${view.rewardName} redeemed — the ledger entry is recorded.`}
                disabled={busy}
                className="w-full sm:w-auto"
              >
                Redeem
              </ConfirmButton>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
