import type { Metadata } from "next";

import { TenantPicker } from "@/auth/tenant-picker";
import { requirePageAccess } from "@/auth/guard";
import { loadProfileView } from "@/features/customers/service";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatNumber } from "@/lib/format";

import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "Profile",
};

/**
 * The member's account screen (checklist §7 bullets 5 and 6).
 *
 * Deliberately not gated on an active tenant: contact details and password
 * belong to the *identity*, so they stay editable for someone with no
 * membership yet, several memberships, or a preview session.
 */
export default async function ProfilePage() {
  const auth = await requirePageAccess("profile.read");
  const profile = await loadProfileView(auth);

  return (
    <PageContainer>
      <PageHeader
        title="Profile"
        description="Your contact details and account security. Changes apply to your account only — other members never see them."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact details</CardTitle>
            <CardDescription>
              Used for receipts and program emails. Your email stays the address
              you sign in with.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              defaultValues={{
                name: profile.name,
                phone: profile.phone ?? "",
                email: profile.email,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your memberships</CardTitle>
            <CardDescription>
              One card per program — balances and rewards stay separate.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {profile.memberships.length === 0 ? (
              <EmptyState
                title="No memberships yet"
                description="Join a program from the merchant's join link and your card will be listed here."
              />
            ) : (
              <>
                <ul className="flex flex-col gap-2">
                  {profile.memberships.map((membership) => (
                    <li
                      key={membership.merchantId}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">
                          {membership.merchantName}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {membership.programType === "STAMPS"
                            ? "Stamp card"
                            : membership.programType === "POINTS"
                              ? "Points program"
                              : "Program type not set"}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge variant="secondary">
                          {formatNumber(membership.balance)} {membership.unit}
                        </Badge>
                        {membership.active ? (
                          <Badge variant="outline">Current</Badge>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
                {profile.memberships.length > 1 ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-muted-foreground text-sm">
                      Choose the program you want to see under Overview.
                    </p>
                    <TenantPicker
                      candidates={profile.memberships.map((membership) => ({
                        merchantId: membership.merchantId,
                        merchantName: membership.merchantName,
                        role: "CUSTOMER",
                      }))}
                    />
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {auth.preview ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Account security</CardTitle>
            <CardDescription>
              Changing your password signs every other device out of this
              account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
