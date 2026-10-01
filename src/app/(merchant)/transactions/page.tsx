import type { Metadata } from "next";

import { can, requirePageAccess } from "@/auth/guard";
import { getDb } from "@/db/connection";
import { findProgram } from "@/features/loyalty/service";
import {
  listMemberOptions,
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
import { formatDateTime, formatMoney } from "@/lib/format";

import { AdjustBalance } from "./adjust-balance";

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
 * Merchant ledger history (checklist §8 bullets 7–8, PRD §13).
 *
 * One projection for every reader: names, amounts, reason, actor — no
 * idempotency keys, no raw metadata, no identity tokens. The adjustment entry
 * point is rendered only for roles holding `transactions.adjust`; the server
 * enforces the same capability regardless of what is rendered.
 */
export default async function TransactionsPage({
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
          description="The append-only loyalty ledger: earns, redemptions and manual adjustments."
        />
        <EmptyState
          title="No active workspace"
          description="Transaction history belongs to a business workspace. Pick the workspace you're working in."
        />
      </PageContainer>
    );
  }

  const canAdjust = can(auth, "transactions.adjust");
  const db = await getDb();

  const [transactions, program, memberOptions] = await Promise.all([
    listTenantTransactions(auth, { group }),
    canAdjust ? findProgram(db.manager, auth.merchantId) : null,
    canAdjust ? listMemberOptions(auth) : [],
  ]);

  const unitName =
    program?.unitName ?? (program?.type === "STAMPS" ? "stamps" : "points");

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
      key: "purchase",
      header: "Purchase",
      className: "text-right tabular-nums",
      cell: (entry) =>
        entry.purchaseAmount === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          formatMoney(entry.purchaseAmount, entry.currency ?? "USD")
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
        description="The append-only loyalty ledger: earns, redemptions and manual adjustments. Entries are never edited — corrections are new entries."
        meta={
          <>
            <span className="text-muted-foreground text-xs tabular-nums">
              {transactions.length} entries
            </span>
            {canAdjust ? (
              <AdjustBalance
                memberOptions={memberOptions}
                unitName={unitName}
              />
            ) : (
              <span className="text-muted-foreground text-xs">
                Manual adjustments: owners and managers
              </span>
            )}
          </>
        }
      />
      <DataTable
        label="Loyalty transactions"
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
      />{" "}
    </PageContainer>
  );
}
