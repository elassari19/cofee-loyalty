import type { Metadata } from "next";

import { can, requirePageAccess } from "@/auth/guard";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { getBusiness } from "@/lib/demo-store";

import { BusinessSettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "Business settings",
};

export default async function SettingsPage() {
  const auth = await requirePageAccess("merchant.read");
  const canWrite = can(auth, "merchant.write");
  const settings = getBusiness();

  return (
    <PageContainer>
      <PageHeader
        title="Business settings"
        description="Identity, contact details and receipt behaviour for this store."
        meta={
          canWrite ? (
            <Badge variant="secondary">You can change these settings</Badge>
          ) : (
            <Badge variant="outline">Owner-only · read-only for you</Badge>
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Store profile</CardTitle>
          <CardDescription>
            {canWrite
              ? "Saving is confirmed on the server; failures report that nothing changed."
              : "Managers can view these settings — only the owner can change them."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessSettingsForm defaultValues={settings} disabled={!canWrite} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
