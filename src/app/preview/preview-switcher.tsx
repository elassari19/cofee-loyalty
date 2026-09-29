"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon, LogOutIcon, StoreIcon, UserRoundIcon } from "lucide-react";

import type { Role } from "@/auth/roles";
import { ROLE_HOME, roleLabel } from "@/auth/roles";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { notify } from "@/components/patterns/toast";

interface RoleCard {
  role: Role;
  icon: typeof StoreIcon;
  summary: string;
}

const ROLE_CARDS: RoleCard[] = [
  {
    role: "SUPER_ADMIN",
    icon: StoreIcon,
    summary:
      "Platform console — merchants, users, platform analytics and settings.",
  },
  {
    role: "MERCHANT_OWNER",
    icon: StoreIcon,
    summary:
      "Merchant console with full control over program, team and business settings.",
  },
  {
    role: "MERCHANT_MANAGER",
    icon: StoreIcon,
    summary:
      "Merchant console without business-settings writes — same pages, tighter capabilities.",
  },
  {
    role: "MERCHANT_STAFF",
    icon: EyeIcon,
    summary:
      "Counter register — find customers, record purchases, redeem rewards.",
  },
  {
    role: "CUSTOMER",
    icon: UserRoundIcon,
    summary:
      "Customer portal — balance, rewards, activity, offers and own profile.",
  },
];

export function PreviewSwitcher({
  current,
}: {
  current: { role: Role; preview: boolean } | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Role | "exit" | null>(null);

  async function post(body: string) {
    return fetch("/api/preview", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  }

  async function choose(role: Role) {
    setPending(role);
    try {
      const response = await post(`role=${encodeURIComponent(role)}`);
      if (!response.ok) throw new Error(`status ${response.status}`);
      router.push(ROLE_HOME[role]);
      router.refresh();
    } catch {
      notify.error("Couldn't switch the preview role. Nothing changed.");
      setPending(null);
    }
  }

  async function exit() {
    setPending("exit");
    try {
      await post("clear=1");
      router.push("/");
      router.refresh();
    } catch {
      notify.error("Couldn't end the preview. Nothing changed.");
      setPending(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Role preview</CardTitle>
          <CardDescription>
            Pick a role to view this workspace as. Access is enforced
            server-side for each route and API call — this preview only sets who
            the guards see. Development only: the preview cookie is ignored and
            its endpoint returns 404 in production.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {current ? (
              <>
                Currently viewing as{" "}
                <span className="font-medium">{roleLabel(current.role)}</span>
                {current.preview ? " (preview)" : ""}
              </>
            ) : (
              "No active session on this browser."
            )}
          </p>
          {current?.preview ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exit()}
              disabled={pending !== null}
            >
              {pending === "exit" ? (
                <Spinner className="size-3.5" />
              ) : (
                <LogOutIcon />
              )}
              End preview
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <ul aria-label="Available preview roles" className="grid gap-3">
        {ROLE_CARDS.map((card) => {
          const active = current?.role === card.role;
          const loading = pending === card.role;
          return (
            <li key={card.role}>
              <button
                type="button"
                onClick={() => void choose(card.role)}
                disabled={pending !== null}
                aria-busy={loading}
                className={cn(
                  "border-border hover:bg-muted/50 focus-visible:ring-ring/50 flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors",
                  "focus-visible:ring-3 focus-visible:outline-none disabled:opacity-60",
                  active && "bg-muted/60 border-foreground/30",
                )}
              >
                <span
                  aria-hidden="true"
                  className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg"
                >
                  <card.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {roleLabel(card.role)}
                    </span>
                    {active ? <Badge variant="secondary">Viewing</Badge> : null}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
                    {card.summary}
                  </span>
                </span>
                {loading ? <Spinner className="size-4 shrink-0" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
