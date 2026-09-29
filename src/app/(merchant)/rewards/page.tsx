import type { Metadata } from "next";

import { requirePageAccess } from "@/auth/guard";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/states";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { formatNumber } from "@/lib/format";

import type { Reward } from "@/lib/demo-store";
import { listRewards } from "@/lib/demo-store";

import { RewardActions } from "./reward-actions";

export const metadata: Metadata = {
  title: "Rewards",
};

export default async function RewardsPage() {
  await requirePageAccess("rewards.read");
  const rewards = listRewards();

  const columns: DataTableColumn<Reward>[] = [
    {
      key: "reward",
      header: "Reward",
      cell: (reward) => (
        <div className="flex flex-col">
          <span className="font-medium">{reward.name}</span>
          <span className="text-muted-foreground text-xs">
            {reward.description}
          </span>
        </div>
      ),
    },
    {
      key: "cost",
      header: "Cost",
      className: "text-right tabular-nums",
      cell: (reward) => formatNumber(reward.cost),
    },
    {
      key: "redeemed",
      header: "Redeemed",
      className: "text-right tabular-nums",
      cell: (reward) => formatNumber(reward.redeemed),
    },
    {
      key: "status",
      header: "Status",
      cell: (reward) => (
        <StatusBadge
          status={reward.active ? "active" : "disabled"}
          label={reward.active ? "Active" : "Paused"}
        />
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "w-36",
      cell: (reward) => <RewardActions reward={reward} />,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Rewards"
        description="What customers can redeem, for how many points. Activating and pausing asks for confirmation and reports the result."
        meta={
          <span className="text-muted-foreground text-xs tabular-nums">
            {rewards.filter((reward) => reward.active).length} active ·{" "}
            {rewards.length} total
          </span>
        }
      />

      <DataTable
        label="Rewards"
        columns={columns}
        rows={rewards}
        getRowKey={(reward) => reward.id}
        empty={
          <EmptyState
            title="No rewards yet"
            description="Create the first reward once the data layer lands in §4; the activation flow is ready."
          />
        }
      />
    </PageContainer>
  );
}
