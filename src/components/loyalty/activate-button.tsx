"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RocketIcon } from "lucide-react";

import { activateProgramAction } from "@/features/loyalty/actions";
import { report } from "@/auth/client-actions";
import { notify } from "@/components/patterns/toast";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Launch button (checklist §6 bullet 5).
 *
 * One action flips both rows — the program goes `active` and the business
 * leaves `trial` — inside a single transaction, so the button either lands
 * fully live or reports that nothing changed. `report` swallows the
 * navigation-shaped errors Next uses for redirects while still surfacing a
 * real refusal as a toast.
 */
export function ActivateButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function activate() {
    setPending(true);
    try {
      const ok = await report(() => activateProgramAction());
      if (ok) {
        notify.success(
          "Your program is live — display the join QR so customers can enroll.",
        );
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      onClick={() => void activate()}
      disabled={pending}
      aria-busy={pending}
      className="w-full"
    >
      {pending ? (
        <Spinner className="size-4" aria-hidden="true" />
      ) : (
        <RocketIcon aria-hidden="true" />
      )}
      {pending ? "Activating…" : "Activate & go live"}
    </Button>
  );
}
