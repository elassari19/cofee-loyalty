import type { Metadata } from "next";

import { requirePageAccess } from "@/auth/guard";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/states";
import { FilterSelect } from "@/components/patterns/filter-select";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { formatDateTime, formatSignedPoints } from "@/lib/format";

import type { Transaction, TransactionType } from "@/lib/demo-store";
import { CURRENT_CUSTOMER_ID, listTransactions } from "@/lib/demo-store";

export const metadata: Metadata = {
  title: "Activity",
};

const TYPE_LABEL: Record<TransactionType, string> = {
  earn: "Earn",
  redeem: "Redeem",
  adjustment: "Adjustment",
};

const TYPE_OPTIONS = (Object.keys(TYPE_LABEL) as TransactionType[]).map(
  (value) => ({ value, label: TYPE_LABEL[value] }),
);

export default async function CustomerActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  await requirePageAccess("transactions.read");
  const rawType = (await searchParams).type;
  const type =
    typeof rawType === "string" && rawType in TYPE_LABEL
      ? (rawType as TransactionType)
      : undefined;

  // Own records only: the customer id comes from the resolved session, never
  // from the URL, so another member's history can't be requested here.
  const transactions = listTransactions({
    customerId: CURRENT_CUSTOMER_ID,
    ...(type ? { type } : {}),
  });

  const columns: DataTableColumn<Transaction>[] = [
    {
      key: "when",
      header: "When",
      cell: (transaction) => formatDateTime(transaction.at),
    },
    {
      key: "type",
      header: "Type",
      cell: (transaction) => (
        <StatusBadge
          status={transaction.type}
          label={TYPE_LABEL[transaction.type]}
        />
      ),
    },
    {
      key: "detail",
      header: "Detail",
      cell: (transaction) => transaction.note,
    },
    {
      key: "points",
      header: "Points",
      className: "text-right font-medium tabular-nums",
      cell: (transaction) => (
        <span className={transaction.points < 0 ? "text-destructive" : ""}>
          {formatSignedPoints(transaction.points)}
        </span>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Activity"
        description="Every point earned or spent on your card, newest first."
        meta={
          <span className="text-muted-foreground text-xs tabular-nums">
            {transactions.length} entries
          </span>
        }
      />

      <DataTable
        label="Your loyalty activity"
        columns={columns}
        rows={transactions}
        getRowKey={(transaction) => transaction.id}
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
