import type { Metadata } from "next";

import { requirePageAccess } from "@/auth/guard";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { getOwnProfile } from "@/lib/demo-store";

import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "Profile",
};

export default async function ProfilePage() {
  await requirePageAccess("profile.read");
  const profile = getOwnProfile();

  return (
    <PageContainer>
      <PageHeader
        title="Profile"
        description="Your contact details on this loyalty membership. Changes apply to your account only."
      />

      <Card>
        <CardHeader>
          <CardTitle>Contact details</CardTitle>
          <CardDescription>
            Used for receipts and program emails — never shown to other
            customers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm defaultValues={profile} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
