import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { EyeIcon, ShieldCheckIcon } from "lucide-react";

import { resolveAuthFromCookieSource, homePathFor } from "@/auth/context";
import { roleLabel } from "@/auth/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * Sign-in landing spot (checklist §3 → §5).
 *
 * Real credential sign-in, password reset and session expiry ship with §5
 * (Better Auth, see ADR 0001). Until then this page reports the caller's
 * current access context honestly instead of pretending to authenticate, and
 * routes people to the role preview.
 */
export default async function SignInPage() {
  const auth = await resolveAuthFromCookieSource(await cookies());

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon aria-hidden="true" className="size-5" />
            Sign in
          </CardTitle>
          <CardDescription>
            {auth
              ? "A session context is active for this browser."
              : "You are not signed in on this browser."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {auth ? (
            <div className="border-border bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {auth.displayName}
                </span>
                <Badge variant="outline">{roleLabel(auth.role)}</Badge>
              </div>
              <p className="text-muted-foreground text-xs">
                {auth.preview
                  ? "Active through the development preview — replaced by real sign-in in §5."
                  : "Authenticated session."}
              </p>
              <Button render={<Link href={homePathFor(auth)} />}>
                Continue to my workspace
                <EyeIcon />
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm leading-relaxed">
              Email and password sign-in, password reset, email verification and
              session expiry arrive with checklist §5 (Better Auth). The server
              guards for every route and API call are already in place —
              anonymous requests are rejected today.
            </p>
          )}

          <Button
            variant={auth ? "outline" : "default"}
            render={<Link href="/preview" />}
          >
            {auth ? "Switch preview role" : "Choose a demo role"}
          </Button>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-center text-xs">
        <Link
          href="/"
          className="hover:text-foreground underline underline-offset-4"
        >
          Back to overview
        </Link>
      </p>
    </div>
  );
}
