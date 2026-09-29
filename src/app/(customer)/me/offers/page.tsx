import type { Metadata } from "next";

import { requirePageAccess } from "@/auth/guard";
import { EmptyState } from "@/components/patterns/states";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listCampaigns } from "@/lib/demo-store";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Offers",
};

export default async function CustomerOffersPage() {
  await requirePageAccess("campaigns.read");
  const offers = listCampaigns().filter(
    (campaign) => campaign.status === "live" || campaign.status === "scheduled",
  );

  return (
    <PageContainer>
      <PageHeader
        title="Offers"
        description="Campaigns and bonuses currently running on this program."
        meta={
          <span className="text-muted-foreground text-xs tabular-nums">
            {offers.length} available
          </span>
        }
      />

      {offers.length === 0 ? (
        <EmptyState
          title="No offers right now"
          description="New campaigns show up here as soon as they go live."
        />
      ) : (
        <ul aria-label="Current offers" className="grid gap-4 sm:grid-cols-2">
          {offers.map((campaign) => (
            <li key={campaign.id}>
              <Card className="h-full gap-3 py-4">
                <CardHeader className="gap-2">
                  <CardTitle className="flex items-start justify-between gap-2 text-base">
                    <span className="min-w-0">{campaign.name}</span>
                    <StatusBadge status={campaign.status} />
                  </CardTitle>
                  <CardDescription>
                    {formatDate(campaign.startsOn)} →{" "}
                    {formatDate(campaign.endsOn)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <p className="text-sm leading-relaxed">{campaign.terms}</p>
                  <p className="text-muted-foreground text-xs">
                    Audience: {campaign.audience}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
