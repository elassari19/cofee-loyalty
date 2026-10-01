import type { Metadata } from "next";

import { requirePageAccess } from "@/auth/guard";
import {
  listTenantTransactions,
  TRANSACTION_GROUPS,
  TRANSACTION_GROUP_LABELS,
  type TenantTransactionRow,
  type TransactionGroup,
} from "@/features/loyalty/transactions";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/patterns/data-table";
import { FilterSelect } from "@/components/patterns/filter-select";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { EmptyState } from "@/components/patterns/states";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Transactions",
};

const GROUP_OPTIONS = TRANSACTION_GROUPS.map((value) => ({
  value,
  label: TRANSACTION_GROUP_LABELS[value],
}));

function parseGroup(
  raw: string | string[] | undefined,
): TransactionGroup | undefined {
  return typeof raw === "string" &&
    (TRANSACTION_GROUPS as readonly string[]).includes(raw)
    ? (raw as TransactionGroup)
    : undefined;
}

/**
 * Counter history for staff (checklist §8 bullet 8).
 *
 * Field-limited by construction: names, amounts, reason and the recording
 * staff member. No idempotency keys, no raw metadata, no identity tokens —
 * the projection lives in `listTenantTransactions`, so a page cannot widen it.
 */
export default async function StaffTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string | string[] }>;
}) {
  const auth = await requirePageAccess([
    "transactions.read",
    "transactions.create",
  ]);
  const group = parseGroup((await searchParams).group);

  if (!auth.merchantId) {
    return (
      <PageContainer>
        <PageHeader
          title="Transactions"
          description="Everything recorded at this store, newest first."
        />
        <EmptyState
          title="No active workspace"
          description="Transaction history belongs to a business workspace. Pick the workspace you're working in."
        />
      </PageContainer>
    );
  }

  const transactions = await listTenantTransactions(auth, { group });

  const columns: DataTableColumn<TenantTransactionRow>[] = [
    {
      key: "when",
      header: "When",
      cell: (entry) => formatDateTime(entry.createdAt),
    },
    {
      key: "customer",
      header: "Member",
      cell: (entry) => (
        <span className="font-medium">{entry.customerName}</span>
      ),
    },
    {
      key: "type",
      header: "Type",
      cell: (entry) => (
        <StatusBadge
          status={entry.group}
          label={TRANSACTION_GROUP_LABELS[entry.group]}
        />
      ),
    },
    {
      key: "amount",
      header: "Amount",
      className: "text-right font-medium tabular-nums",
      cell: (entry) => (
        <span className={entry.delta < 0 ? "text-destructive" : ""}>
          {entry.amountLabel}
        </span>
      ),
    },
    {
      key: "detail",
      header: "Detail",
      cell: (entry) => (
        <span className="text-muted-foreground">{entry.detail}</span>
      ),
    },
    {
      key: "staff",
      header: "Recorded by",
      cell: (entry) => (
        <span className="text-muted-foreground">{entry.recordedBy ?? "—"}</span>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Transactions"
        description="Everything recorded at this store, newest first."
        meta={
          <span className="text-muted-foreground text-xs tabular-nums">
            {transactions.length} entries
          </span>
        }
      />

      <DataTable
        label="Counter transactions"
        columns={columns}
        rows={transactions}
        getRowKey={(entry) => entry.id}
        toolbar={
          <FilterSelect
            param="group"
            label="Filter by type"
            value={group ?? ""}
            options={GROUP_OPTIONS}
            allLabel="All types"
          />
        }
        empty={
          <EmptyState
            title="No transactions of this type"
            description="Choose another type to see more activity, or clear the filter."
          />
        }
      />
    </PageContainer>
  );
}
