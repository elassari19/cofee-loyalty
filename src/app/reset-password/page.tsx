import Link from "next/link";
import type { Metadata } from "next";
import { AlertCircleIcon, KeyRoundIcon } from "lucide-react";

import { ResetPasswordForm } from "@/auth/auth-forms";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Set a new password",
};

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

/**
 * Password reset landing page (checklist §5).
 *
 * The token arrives in the link and is never rendered — it is passed straight
 * to the form and re-checked by Better Auth on submit. An expired or unknown
 * token shows a neutral notice with a way to request a new link.
 */
export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";

  return (
    <AuthCard
      icon={KeyRoundIcon}
      title="Set a new password"
      description="Choose a password you haven't used here before."
    >
      {value ? (
        <ResetPasswordForm token={value} />
      ) : (
        <>
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>Link invalid or expired</AlertTitle>
            <AlertDescription>
              This reset link can&apos;t be used. Request a fresh one — each
              link works once and expires after an hour.
            </AlertDescription>
          </Alert>
          <Link
            href="/forgot-password"
            className="hover:text-foreground text-center text-sm underline underline-offset-4"
          >
            Send me a new link
          </Link>
        </>
      )}
    </AuthCard>
  );
}
