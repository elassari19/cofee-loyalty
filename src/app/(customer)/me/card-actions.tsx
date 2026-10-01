"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyIcon, RefreshCcwIcon } from "lucide-react";

import { report } from "@/auth/client-actions";
import { rotateIdentityTokenAction } from "@/features/customers/actions";
import { ConfirmButton } from "@/components/patterns/confirm";
import { notify } from "@/components/patterns/toast";
import { Button } from "@/components/ui/button";

/**
 * Actions on the member's own QR card (checklist §7 bullet 3).
 *
 * Copying the payload is how a member hands their code to staff for lookups;
 * replacing it is a destructive, confirmed operation that revokes the live
 * token in one transaction — the old image stops resolving the moment the
 * server confirms, and the page is re-read from the database so what's
 * rendered is always the token that currently works.
 */
export function CardActions({ payload }: { payload: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      notify.success("Card code copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.error(
        "Couldn't reach the clipboard — select the code and copy it.",
      );
    }
  }

  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void copy()}
      >
        <CopyIcon aria-hidden="true" className="size-4" />
        {copied ? "Copied" : "Copy code"}
      </Button>
      <ConfirmButton
        variant="outline"
        size="sm"
        title="Replace your loyalty card?"
        description="The current QR code stops working right away and a new one appears here. Do this if your card was photographed or shared by mistake."
        confirmLabel="Replace card"
        onConfirm={async () => {
          const ok = await report(() => rotateIdentityTokenAction());
          if (ok) {
            notify.success(
              "New card issued — your previous QR code no longer works.",
            );
            router.refresh();
          }
        }}
      >
        <RefreshCcwIcon aria-hidden="true" className="size-4" />
        Replace
      </ConfirmButton>
    </div>
  );
}
