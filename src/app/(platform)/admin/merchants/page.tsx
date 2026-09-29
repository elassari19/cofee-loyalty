import type { Metadata } from "next";

import { requirePageAccess } from "@/auth/guard";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/states";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { SearchForm } from "@/components/patterns/search-form";
import { StatusBadge } from "@/components/patterns/status-badge";
import { formatNumber } from "@/lib/format";

import type { Merchant } from "@/lib/demo-store";
import { listMerchants } from "@/lib/demo-store";

export const metadata: Metadata = {
  title: "Merchants",
};

export default async function MerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await requirePageAccess("platform.manage");
  const query = (await searchParams).q;
  const search = (typeof query === "string" ? query : "").trim().toLowerCase();

  const merchants = listMerchants().filter(
    (merchant) =>
      !search ||
      merchant.name.toLowerCase().includes(search) ||
      merchant.slug.includes(search),
  );

  const columns: DataTableColumn<Merchant>[] = [
    {
      key: "name",
      header: "Merchant",
      cell: (merchant) => (
        <div className="flex flex-col">
          <span className="font-medium">{merchant.name}</span>
          <span className="text-muted-foreground text-xs">
            /{merchant.slug}
          </span>
        </div>
      ),
    },
    { key: "plan", header: "Plan", cell: (merchant) => merchant.plan },
    {
      key: "status",
      header: "Status",
      cell: (merchant) => <StatusBadge status={merchant.status} />,
    },
    {
      key: "customers",
      header: "Customers",
      className: "text-right tabular-nums",
      cell: (merchant) => formatNumber(merchant.customers),
    },
    { key: "joined", header: "Joined", cell: (merchant) => merchant.joinedOn },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Merchants"
        description="Every tenant on the platform with its plan, status and program size."
        meta={
          <span className="text-muted-foreground text-xs tabular-nums">
            {merchants.length} of {listMerchants().length} shown
          </span>
        }
      />

      <DataTable
        label="Merchants"
        columns={columns}
        rows={merchants}
        getRowKey={(merchant) => merchant.id}
        toolbar={
          <SearchForm
            label="Search merchants"
            placeholder="Name or slug…"
            defaultValue={search}
          />
        }
        empty={
          <EmptyState
            title={`No merchants match “${search}”`}
            description="Check the spelling, or clear the search to see every tenant."
          />
        }
      />
    </PageContainer>
  );
}
