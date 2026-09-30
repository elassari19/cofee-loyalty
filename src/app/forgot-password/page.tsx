import type { Metadata } from "next";
import { KeyRoundIcon } from "lucide-react";

import { RequestPasswordResetForm } from "@/auth/auth-forms";
import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = {
  title: "Reset password",
};

/**
 * Password reset request (checklist §5).
 *
 * The form's answer is identical whether or not the address exists — an
 * account-existence oracle is a feature for attackers, not for users — and
 * both outcomes are written to the audit trail with the real reason.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthCard
      icon={KeyRoundIcon}
      title="Reset your password"
      description="We'll email you a link that expires in one hour."
    >
      <RequestPasswordResetForm />
    </AuthCard>
  );
}
