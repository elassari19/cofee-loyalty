"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TicketIcon } from "lucide-react";

import { issueRedemptionAction } from "@/features/redemptions/actions";
import { formatDateTime, formatNumber } from "@/lib/format";
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
 * Customer-side issuance (checklist §9 bullet 4, PRD §19/§20).
 *
 * Requesting a code reserves the cost from the member's balance inside one
 * transaction and hands back an opaque code **once** — only its hash is
 * stored, so this dialog is the only place it will ever be shown. Generating
 * again replaces (and refunds) the previous code, which is how a customer
 * who closed the dialog or lost the code gets a fresh one.
 *
 * The button is rendered for every reward; one without enough balance is
 * disabled, and the server refuses it again regardless.
 */
export function RedeemButton({
  rewardId,
  rewardName,
  cost,
  unitLabel,
  affordable,
}: {
  rewardId: string;
  rewardName: string;
  cost: number;
  unitLabel: string;
  affordable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [issued, setIssued] = useState<{
    formattedCode: string;
    rewardName: string;
    balance: number;
    unitName: string;
    expiresAt: Date;
    replacedPreviousCode: boolean;
  } | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setIssued(null);
  }

  async function handleIssue() {
    setPending(true);
    const result = await issueRedemptionAction(rewardId);
    setPending(false);
    if (!result.ok) {
      notify.error(result.message);
      return;
    }
    setIssued(result.data);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant={affordable ? "default" : "outline"}
            disabled={!affordable}
          />
        }
      >
        <TicketIcon aria-hidden="true" />
        Redeem
      </DialogTrigger>
      <DialogContent>
        {!issued ? (
          <>
            <DialogHeader>
              <DialogTitle>Redeem “{rewardName}”</DialogTitle>
              <DialogDescription>
                {formatNumber(cost)} {unitLabel} will be held for this code.
                Show it at the counter — staff verify it first, then complete
                it.
              </DialogDescription>
            </DialogHeader>
            <p className="text-muted-foreground text-xs">
              The code is shown once and cannot be read back later. If you lose
              it, generate a new one here — the old code stops working and the
              value returns to your balance.
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button onClick={handleIssue} disabled={pending}>
                {pending ? "Generating…" : "Generate code"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Your reward code</DialogTitle>
              <DialogDescription>
                “{issued.rewardName}” — show this to the cashier.
              </DialogDescription>
            </DialogHeader>
            <p
              className="text-foreground bg-muted rounded-lg border px-4 py-6 text-center font-mono text-3xl tracking-[0.2em]"
              data-testid="redemption-code"
            >
              {issued.formattedCode}
            </p>
            <p className="text-muted-foreground text-center text-xs">
              Valid until {formatDateTime(issued.expiresAt)} · your balance is{" "}
              {formatNumber(issued.balance)} {issued.unitName}
            </p>
            {issued.replacedPreviousCode ? (
              <p className="text-muted-foreground text-center text-xs">
                Your previous code for this reward is now void.
              </p>
            ) : null}
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
