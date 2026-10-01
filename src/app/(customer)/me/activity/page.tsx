import type { Metadata } from "next";

import { requirePageAccess } from "@/auth/guard";
import {
  ACTIVITY_GROUPS,
  listCustomerActivity,
  type ActivityGroup,
  type CustomerContext,
} from "@/features/customers/service";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/patterns/data-table";
import { FilterSelect } from "@/components/patterns/filter-select";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { EmptyState } from "@/components/patterns/states";
import { formatDateTime } from "@/lib/format";

import { loadMembershipState, renderMembership } from "../state";

export const metadata: Metadata = {
  title: "Activity",
};

const TYPE_LABEL: Record<ActivityGroup, string> = {
  earn: "Earn",
  redeem: "Redeem",
  adjustment: "Adjustment",
};

const TYPE_OPTIONS = ACTIVITY_GROUPS.map((value) => ({
  value,
  label: TYPE_LABEL[value],
}));

export default async function CustomerActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const auth = await requirePageAccess("transactions.read");
  const state = await loadMembershipState(auth);

  const rawType = (await searchParams).type;
  const type =
    typeof rawType === "string" &&
    ACTIVITY_GROUPS.includes(rawType as ActivityGroup)
      ? (rawType as ActivityGroup)
      : undefined;

  return renderMembership(state, auth.displayName, (ctx) => (
    <Activity key={ctx.merchant.id} ctx={ctx} type={type} />
  ));
}

/**
 * The member's ledger history (checklist §7 bullet 5, PRD §17).
 *
 * Every row is selected from the resolved membership's own profile and
 * tenant ids — the filter only ever narrows *this* member's history, so the
 * URL can't be used to page through anyone else's.
 */
async function Activity({
  ctx,
  type,
}: {
  ctx: CustomerContext;
  type: ActivityGroup | undefined;
}) {
  const activity = await listCustomerActivity(ctx, type ? { group: type } : {});

  const columns: DataTableColumn<(typeof activity)[number]>[] = [
    {
      key: "when",
      header: "When",
      cell: (row) => formatDateTime(row.createdAt),
    },
    {
      key: "type",
      header: "Type",
      cell: (row) => (
        <StatusBadge status={row.group} label={TYPE_LABEL[row.group]} />
      ),
    },
    {
      key: "detail",
      header: "Detail",
      cell: (row) => (
        <span className="flex flex-col">
          <span>{row.detail}</span>
          {row.subtitle ? (
            <span className="text-muted-foreground text-xs">
              {row.subtitle}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      className: "text-right font-medium tabular-nums",
      cell: (row) => (
        <span className={row.delta < 0 ? "text-destructive" : ""}>
          {row.amountLabel}
        </span>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Activity"
        description={`Every entry on your card at ${ctx.merchant.name}, newest first.`}
        meta={
          <span className="text-muted-foreground text-xs tabular-nums">
            {activity.length} entries
          </span>
        }
      />

      <DataTable
        label="Your loyalty activity"
        columns={columns}
        rows={activity}
        getRowKey={(row) => row.id}
        toolbar={
          <FilterSelect
            param="type"
            label="Filter by type"
            value={type ?? ""}
            options={TYPE_OPTIONS}
            allLabel="All activity"
          />
        }
        empty={
          <EmptyState
            title={type ? "No entries of this type" : "No activity yet"}
            description={
              type
                ? "Choose another type to see the rest of your history."
                : "Your first purchase will appear here once it's recorded at the counter."
            }
          />
        }
      />
    </PageContainer>
  );
}
