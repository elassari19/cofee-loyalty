"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCodeIcon } from "lucide-react";

import { report } from "@/auth/client-actions";
import { joinMerchantAction } from "@/features/customers/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * One-click join for an account that is already signed in (checklist §7
 * bullets 2–4).
 *
 * The action is idempotent, so a double-tap posts twice and lands on the same
 * membership; on success the active-tenant cookie is already written and the
 * router takes the member straight to their card.
 */
export function JoinButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function join() {
    setPending(true);
    const ok = await report(() => joinMerchantAction({ slug }));
    setPending(false);
    if (ok) router.push("/me");
  }

  return (
    <Button
      type="button"
      className="w-full"
      disabled={pending}
      onClick={() => void join()}
    >
      {pending ? (
        <Spinner aria-hidden="true" className="size-4" />
      ) : (
        <QrCodeIcon aria-hidden="true" className="size-4" />
      )}
      {pending ? "Joining…" : "Join the program"}
    </Button>
  );
}
