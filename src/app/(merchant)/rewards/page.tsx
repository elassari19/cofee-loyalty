import type { Metadata } from "next";

import { requirePageAccess } from "@/auth/guard";
import { requireTenant } from "@/auth/tenant";
import { getDb } from "@/db/connection";
import { unitLabel } from "@/features/loyalty/calculation";
import { findProgram } from "@/features/loyalty/service";
import type { RewardSummary } from "@/features/rewards/schemas";
import { listTenantRewards } from "@/features/rewards/service";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/states";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { formatNumber, localDay, formatDate } from "@/lib/format";

import { RewardActions } from "./reward-actions";
import { RewardDialog } from "./reward-dialog";

export const metadata: Metadata = {
  title: "Rewards",
};

/**
 * The merchant's reward catalogue (checklist §9 bullets 1–2, PRD §18).
 *
 * Backed by the tenant-scoped `reward` table — create, edit and pause all go
 * through server actions that resolve the tenant from the session, so a
 * crafted reward id from another store is a 404 rather than a toggle. The
 * redemption counter is shown as "issued of limit" because it is exactly
 * that: codes minted against the reward, not completions.
 */
export default async function RewardsPage() {
  const auth = await requirePageAccess("rewards.read");
  const merchantId = requireTenant(auth);
  const rewards = await listTenantRewards(auth);

  const db = await getDb();
  const program = await findProgram(db.manager, merchantId);
  const unit = program ? unitLabel(program) : "points";

  const rows: RewardSummary[] = rewards.map((reward) => ({
    id: reward.id,
    name: reward.name,
    description: reward.description,
    terms: reward.terms,
    cost: reward.cost,
    unit: reward.unit,
    status: reward.status,
    redemptionCount: reward.redemptionCount,
    redemptionLimit: reward.redemptionLimit,
    expiresAt: reward.expiresAt ? reward.expiresAt.toISOString() : null,
  }));

  const columns: DataTableColumn<RewardSummary>[] = [
    {
      key: "reward",
      header: "Reward",
      cell: (reward) => (
        <div className="flex flex-col">
          <span className="font-medium">{reward.name}</span>
          <span className="text-muted-foreground text-xs">
            {reward.description ?? reward.terms ?? "—"}
          </span>
        </div>
      ),
    },
    {
      key: "cost",
      header: "Cost",
      className: "text-right tabular-nums",
      cell: (reward) => `${formatNumber(reward.cost)} ${unit}`,
    },
    {
      key: "redeemed",
      header: "Issued",
      className: "text-right tabular-nums",
      cell: (reward) =>
        reward.redemptionLimit === null
          ? formatNumber(reward.redemptionCount)
          : `${formatNumber(reward.redemptionCount)} / ${formatNumber(reward.redemptionLimit)}`,
    },
    {
      key: "expires",
      header: "Expires",
      cell: (reward) =>
        reward.expiresAt ? (
          formatDate(localDay(new Date(reward.expiresAt)))
        ) : (
          <span className="text-muted-foreground">Never</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (reward) => (
        <StatusBadge
          status={reward.status === "active" ? "active" : "disabled"}
          label={reward.status === "active" ? "Active" : "Paused"}
        />
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "w-56",
      cell: (reward) => <RewardActions reward={reward} unitLabel={unit} />,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Rewards"
        description="What customers can request in their portal, and how many codes may be issued for each. Pausing stops new codes; codes already issued keep their value."
        meta={
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-xs tabular-nums">
              {rows.filter((reward) => reward.status === "active").length}{" "}
              active · {rows.length} total
            </span>
            <RewardDialog unitLabel={unit} />
          </div>
        }
      />

      <DataTable
        label="Rewards"
        columns={columns}
        rows={rows}
        getRowKey={(reward) => reward.id}
        empty={
          <EmptyState
            title="No rewards yet"
            description="Create the first reward — customers will see it in their portal as soon as it is active."
            action={<RewardDialog unitLabel={unit} />}
          />
        }
      />
    </PageContainer>
  );
}
