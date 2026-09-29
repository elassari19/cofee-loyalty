import type { Metadata } from "next";

import { requirePageAccess } from "@/auth/guard";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/states";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { formatDate } from "@/lib/format";

import type { Campaign } from "@/lib/demo-store";
import { listCampaigns } from "@/lib/demo-store";

import { NewCampaignButton } from "./campaign-form";

export const metadata: Metadata = {
  title: "Campaigns",
};

export default async function CampaignsPage() {
  await requirePageAccess("campaigns.read");
  const campaigns = listCampaigns();

  const columns: DataTableColumn<Campaign>[] = [
    {
      key: "campaign",
      header: "Campaign",
      cell: (campaign) => (
        <div className="flex flex-col">
          <span className="font-medium">{campaign.name}</span>
          <span className="text-muted-foreground line-clamp-1 text-xs">
            {campaign.terms || "No terms yet."}
          </span>
        </div>
      ),
    },
    {
      key: "audience",
      header: "Audience",
      cell: (campaign) => campaign.audience,
    },
    {
      key: "schedule",
      header: "Schedule",
      cell: (campaign) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {formatDate(campaign.startsOn)} → {formatDate(campaign.endsOn)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (campaign) => <StatusBadge status={campaign.status} />,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Campaigns"
        description="Scheduled promotions and offers shown to customers in their portal."
        actions={<NewCampaignButton />}
      />

      <DataTable
        label="Campaigns"
        columns={columns}
        rows={campaigns}
        getRowKey={(campaign) => campaign.id}
        empty={
          <EmptyState
            title="No campaigns yet"
            description="Create the first campaign to schedule points bonuses and seasonal offers."
            action={<NewCampaignButton />}
          />
        }
      />
    </PageContainer>
  );
}
