import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { UserPlusIcon } from "lucide-react";

import { SignUpForm } from "@/auth/auth-forms";
import { resolveAuthFromCookieSource } from "@/auth/context";
import { destinationFor, safeNextPath } from "@/auth/flows";
import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = {
  title: "Create account",
};

interface SignUpPageProps {
  searchParams: Promise<{ next?: string }>;
}

/**
 * Registration (checklist §5).
 *
 * Accounts are created as plain platform identities: the form carries a name,
 * an email and a password and nothing else — the database defaults decide
 * role and status, so a crafted request cannot register itself as a merchant
 * owner or a platform administrator. Merchant provisioning happens through
 * onboarding (§6), never through this form.
 */
export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  const next = safeNextPath(params.next) ?? undefined;
  const auth = await resolveAuthFromCookieSource(
    await cookies(),
    await headers(),
  );
  if (auth) redirect(next ?? destinationFor(auth));

  return (
    <AuthCard
      icon={UserPlusIcon}
      title="Create your account"
      description="Sign up to collect and redeem loyalty points."
      footnote={
        <>
          Already registered?{" "}
          <Link
            href="/sign-in"
            className="hover:text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm next={next} />
      <p className="text-muted-foreground text-xs leading-relaxed">
        New accounts start as customer accounts.{" "}
        <Link
          href="/onboarding"
          className="hover:text-foreground underline underline-offset-4"
        >
          Register your business
        </Link>{" "}
        to run a loyalty program — store owners onboard separately, so this form
        never grants access to a merchant workspace.
      </p>
    </AuthCard>
  );
}
