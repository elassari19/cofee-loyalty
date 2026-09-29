"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOutIcon, RepeatIcon } from "lucide-react";

import type { AuthContext } from "@/auth/context";
import { roleLabel } from "@/auth/roles";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notify } from "@/components/patterns/toast";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu({ auth }: { auth: AuthContext }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function endSession() {
    setBusy(true);
    try {
      // Dev preview until §5 ships Better Auth sign-out on this endpoint.
      const response = await fetch("/api/preview", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: auth.preview ? "clear=1" : "signout=1",
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`sign-out failed: ${response.status}`);
      }
      router.push("/");
      router.refresh();
    } catch {
      notify.error("Sign-out failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        render={
          <Button variant="ghost" className="gap-2 pr-1 pl-1.5" disabled={busy}>
            <span
              aria-hidden="true"
              className="bg-muted text-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
            >
              {initialsOf(auth.displayName)}
            </span>
            <span className="hidden max-w-36 truncate text-sm sm:inline">
              {auth.displayName}
            </span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium">
            {auth.displayName}
          </span>
          <span className="text-muted-foreground text-xs font-normal">
            {roleLabel(auth.role)}
            {auth.preview ? " · preview" : ""}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {auth.preview ? (
          <DropdownMenuItem onClick={() => router.push("/preview")}>
            <RepeatIcon />
            Switch preview role
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => void endSession()} disabled={busy}>
          <LogOutIcon />
          {auth.preview ? "End preview" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
