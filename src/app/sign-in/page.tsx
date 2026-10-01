import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { MailCheckIcon, ShieldCheckIcon } from "lucide-react";

import { SignInForm } from "@/auth/auth-forms";
import { isPreviewEnabled, resolveAuthFromCookieSource } from "@/auth/context";
import { destinationFor, safeNextPath } from "@/auth/flows";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sign in",
};

interface SignInPageProps {
  searchParams: Promise<{
    next?: string;
    reset?: string;
    verified?: string;
  }>;
}

/**
 * Credential sign-in (checklist §5).
 *
 * Already-authenticated callers never see the form: they are sent straight to
 * the workspace their session resolves to (including `/choose-merchant` when a
 * merchant identity still has to pick a tenant). The `?next=` target is
 * validated as a same-site path before it reaches the action.
 */
export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const next = safeNextPath(params.next) ?? undefined;
  const store = await cookies();
  const auth = await resolveAuthFromCookieSource(store, await headers());
  if (auth) redirect(next ?? destinationFor(auth));

  return (
    <AuthCard
      icon={ShieldCheckIcon}
      title="Sign in"
      description="Sign in to manage loyalty programs, customers and rewards."
      footnote={
        <>
          <Link
            href="/"
            className="hover:text-foreground underline underline-offset-4"
          >
            Back to overview
          </Link>
        </>
      }
    >
      {params.reset ? (
        <Alert>
          <MailCheckIcon aria-hidden="true" />
          <AlertTitle>Password updated</AlertTitle>
          <AlertDescription>
            Your password was changed. Sign in with the new one — other sessions
            were signed out.
          </AlertDescription>
        </Alert>
      ) : null}

      {params.verified ? (
        <Alert>
          <MailCheckIcon aria-hidden="true" />
          <AlertTitle>Email verified</AlertTitle>
          <AlertDescription>
            Your address is confirmed. Sign in to continue.
          </AlertDescription>
        </Alert>
      ) : null}

      <SignInForm next={next} />

      <p className="text-muted-foreground text-xs leading-relaxed">
        Own a local business?{" "}
        <Link
          href="/onboarding"
          className="hover:text-foreground underline underline-offset-4"
        >
          Register it and set up a loyalty program
        </Link>
        — the wizard takes about two minutes.
      </p>

      {isPreviewEnabled() ? (
        <Button variant="outline" render={<Link href="/preview" />}>
          Choose a demo role
        </Button>
      ) : null}
    </AuthCard>
  );
}
