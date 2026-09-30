"use client";

import { useState } from "react";
import { LogOutIcon } from "lucide-react";

import { signOutAction } from "@/auth/actions";
import { report } from "@/auth/client-actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Ends the real session (checklist §5). The action revokes the Better Auth
 * session, clears the active-tenant cookie and redirects to `/sign-in`;
 * previews keep their own dev-only path in `user-menu`.
 */
export function SignOutButton({
  variant = "outline",
  className,
  children,
}: {
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  className?: string;
  children?: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);

  async function endSession() {
    setPending(true);
    await report(() => signOutAction());
    setPending(false);
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      disabled={pending}
      onClick={() => void endSession()}
    >
      {pending ? (
        <Spinner aria-hidden="true" className="size-3.5" />
      ) : (
        <LogOutIcon aria-hidden="true" />
      )}
      {children ?? "Sign out"}
    </Button>
  );
}
