import type { Metadata } from "next";
import { AlertCircleIcon, Building2Icon } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SignOutButton } from "@/auth/sign-out-button";
import { TenantPicker } from "@/auth/tenant-picker";
import { loadTenantChoices } from "@/auth/flows";
import { requirePageAccess } from "@/auth/guard";

export const metadata: Metadata = {
  title: "Choose a workspace",
};

/**
 * Active-tenant chooser (checklist §5).
 *
 * A merchant identity can belong to several tenants; this is the only place
 * where one becomes active, and the list it shows is read from the session's
 * memberships — never from anything the browser supplies. Direct requests to
 * tenant routes without an active tenant are rejected by `requireTenant`
 * regardless of what was picked here.
 */
export default async function ChooseMerchantPage() {
  const auth = await requirePageAccess();
  const candidates = await loadTenantChoices(auth.userId);

  return (
    <AuthCard
      icon={Building2Icon}
      title="Choose a workspace"
      description={`Signed in as ${auth.displayName}. Pick the merchant you're working in.`}
    >
      {candidates.length > 0 ? (
        <>
          <TenantPicker candidates={candidates} />
          <div className="flex justify-center">
            <SignOutButton variant="ghost">Sign out instead</SignOutButton>
          </div>
        </>
      ) : (
        <>
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>No active workspaces</AlertTitle>
            <AlertDescription>
              This account isn&apos;t a member of any merchant that is active
              right now. An owner can add you to a workspace, or you can sign in
              with a different account.
            </AlertDescription>
          </Alert>
          <SignOutButton className="w-full">Sign out</SignOutButton>
        </>
      )}
    </AuthCard>
  );
}
