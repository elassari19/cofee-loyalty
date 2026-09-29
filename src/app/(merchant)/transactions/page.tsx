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
import { listTransactions } from "@/lib/demo-store";

export const metadata: Metadata = {
  title: "Transactions",
};

const TYPE_LABEL: Record<TransactionType, string> = {
  earn: "Earn",
  redeem: "Redeem",
  adjustment: "Adjustment",
};

const TYPE_OPTIONS = (Object.keys(TYPE_LABEL) as TransactionType[]).map(
  (value) => ({ value, label: TYPE_LABEL[value] }),
);

export default async function TransactionsPage({
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

  const transactions = listTransactions(type ? { type } : undefined);

  const columns: DataTableColumn<Transaction>[] = [
    {
      key: "when",
      header: "When",
      cell: (transaction) => formatDateTime(transaction.at),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (transaction) => (
        <span className="font-medium">{transaction.customerName}</span>
      ),
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
      key: "points",
      header: "Points",
      className: "text-right font-medium tabular-nums",
      cell: (transaction) => (
        <span className={transaction.points < 0 ? "text-destructive" : ""}>
          {formatSignedPoints(transaction.points)}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      className: "text-right tabular-nums",
      cell: (transaction) =>
        transaction.amount === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          `$${transaction.amount.toFixed(2)}`
        ),
    },
    {
      key: "staff",
      header: "Recorded by",
      cell: (transaction) => (
        <span className="text-muted-foreground">{transaction.staff}</span>
      ),
    },
    {
      key: "note",
      header: "Note",
      cell: (transaction) => (
        <span className="text-muted-foreground">{transaction.note}</span>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Transactions"
        description="The append-only loyalty ledger: earns, redemptions and manual adjustments."
        meta={
          <span className="text-muted-foreground text-xs tabular-nums">
            {transactions.length} entries
          </span>
        }
      />

      <DataTable
        label="Loyalty transactions"
        columns={columns}
        rows={transactions}
        getRowKey={(transaction) => transaction.id}
        toolbar={
          <FilterSelect
            param="type"
            label="Filter by type"
            value={type ?? ""}
            options={TYPE_OPTIONS}
            allLabel="All types"
          />
        }
        empty={
          <EmptyState
            title="No transactions of this type"
            description="Choose another type, or clear the filter to see the whole ledger."
          />
        }
      />
    </PageContainer>
  );
}
