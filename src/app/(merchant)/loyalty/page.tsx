import type { Metadata } from "next";

import { requirePageAccess, can } from "@/auth/guard";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { getLoyalty } from "@/lib/demo-store";
import { formatNumber } from "@/lib/format";

import { LoyaltySettingsForm } from "./loyalty-form";

export const metadata: Metadata = {
  title: "Loyalty program",
};

export default async function LoyaltyPage() {
  const auth = await requirePageAccess("loyalty.read");
  const settings = getLoyalty();
  const canWrite = can(auth, "loyalty.write");

  return (
    <PageContainer>
      <PageHeader
        title="Loyalty program"
        description="How customers earn and burn points. Changes apply to future transactions — ledger history is never rewritten."
        meta={
          canWrite ? null : (
            <Badge variant="outline">Read-only for your role</Badge>
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{settings.programName}</CardTitle>
          <CardDescription>{settings.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {formatNumber(settings.earnRate)} pts per $1
          </Badge>
          <Badge variant="secondary">
            {formatNumber(settings.welcomeBonus)} pt welcome bonus
          </Badge>
          <Badge variant="outline">
            Expires after {settings.pointsExpiryMonths} months
          </Badge>
          <Badge variant="outline">
            Minimum purchase ${formatNumber(settings.minPurchase)}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Program rules</CardTitle>
          <CardDescription>
            Values are validated on the server before anything is saved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoyaltySettingsForm defaultValues={settings} disabled={!canWrite} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
