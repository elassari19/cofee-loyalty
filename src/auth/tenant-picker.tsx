"use client";

import { useState } from "react";
import { Building2Icon } from "lucide-react";

import { setActiveMerchantAction } from "@/auth/actions";
import { report } from "@/auth/client-actions";
import { roleLabel } from "@/auth/roles";
import type { TenantCandidate } from "@/auth/session";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Tenant chooser list (checklist §5 — "derive active merchant/tenant context
 * from the authenticated session and membership; do not trust a
 * frontend-supplied merchant ID").
 *
 * The options rendered here are the ones the server resolved for this
 * session; picking one only writes a *cookie*, and the server re-validates it
 * against the same membership list before it is ever acted on.
 */
export function TenantPicker({
  candidates,
}: {
  candidates: TenantCandidate[];
}) {
  const [pending, setPending] = useState<string | null>(null);

  async function choose(merchantId: string) {
    setPending(merchantId);
    await report(() => setActiveMerchantAction({ merchantId }));
    setPending(null);
  }

  return (
    <ul className="flex flex-col gap-2">
      {candidates.map((candidate) => (
        <li key={candidate.merchantId}>
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full justify-start gap-3 px-3 py-2.5"
            disabled={pending !== null}
            onClick={() => void choose(candidate.merchantId)}
          >
            <Building2Icon aria-hidden="true" className="size-4 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
              <span className="truncate text-sm font-medium">
                {candidate.merchantName}
              </span>
              {candidate.role ? (
                <span className="text-muted-foreground text-xs">
                  {roleLabel(candidate.role)}
                </span>
              ) : null}
            </span>
            {pending === candidate.merchantId ? (
              <Spinner aria-hidden="true" className="size-4" />
            ) : null}
          </Button>
        </li>
      ))}
    </ul>
  );
}
