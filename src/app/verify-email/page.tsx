import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AlertCircleIcon, MailCheckIcon, MailIcon } from "lucide-react";

import { ResendVerificationForm } from "@/auth/auth-forms";
import { AuthCard } from "@/components/auth/auth-card";
import { performVerifyEmail } from "@/auth/flows";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Verify your email",
};

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string; sent?: string }>;
}

/**
 * Email verification (checklist §5).
 *
 * Opening the link from the email verifies during render and immediately
 * continues to sign-in; an unknown or expired link explains itself and offers
 * a resend instead of failing silently. Without a token at all (the page after
 * sign-up) it only tells the visitor where to look.
 */
export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const { token, sent } = await searchParams;
  const store = await cookies();
  const requestHeaders = await headers();

  if (typeof token === "string" && token) {
    const result = await performVerifyEmail({
      token,
      headers: requestHeaders,
      readCookie: (name) => store.get(name)?.value,
    });
    if (result.ok) redirect(result.data.redirectTo);
    return (
      <AuthCard icon={MailIcon} title="Link invalid or expired">
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>That link didn&apos;t work</AlertTitle>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
        <ResendVerificationForm />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      icon={MailIcon}
      title="Verify your email"
      description="One click in your inbox activates the account."
    >
      {sent ? (
        <Alert>
          <MailCheckIcon aria-hidden="true" />
          <AlertTitle>Check your inbox</AlertTitle>
          <AlertDescription>
            We sent a verification link. Open it to finish setting up your
            account — it expires in 24 hours.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <MailCheckIcon aria-hidden="true" />
          <AlertTitle>Verification needed</AlertTitle>
          <AlertDescription>
            Enter the address you signed up with and we&apos;ll send a fresh
            link.
          </AlertDescription>
        </Alert>
      )}

      <ResendVerificationForm />

      <p className="text-muted-foreground text-center text-xs">
        <Link
          href="/sign-in"
          className="hover:text-foreground underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
