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
import { formatDate, formatNumber } from "@/lib/format";

import type { Customer } from "@/lib/demo-store";
import { searchCustomers } from "@/lib/demo-store";

export const metadata: Metadata = {
  title: "Find customer",
};

export default async function StaffCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await requirePageAccess("customers.read");
  const query = (await searchParams).q;
  const search = (typeof query === "string" ? query : "").trim();
  const customers = searchCustomers(search);

  // Staff see exactly what the counter needs: identity, balance, tier,
  // recency. Contact details stay hidden here — the field-level rules that
  // back this up land with §10/§5 data scoping; hiding a column is the UX
  // half, never the enforcement half.
  const columns: DataTableColumn<Customer>[] = [
    {
      key: "customer",
      header: "Customer",
      cell: (customer) => <span className="font-medium">{customer.name}</span>,
    },
    {
      key: "points",
      header: "Balance",
      className: "text-right tabular-nums",
      cell: (customer) => formatNumber(customer.points),
    },
    {
      key: "tier",
      header: "Tier",
      cell: (customer) => <StatusBadge status={customer.tier} />,
    },
    {
      key: "status",
      header: "Status",
      cell: (customer) => <StatusBadge status={customer.status} />,
    },
    {
      key: "activity",
      header: "Last visit",
      cell: (customer) => formatDate(customer.lastActivityOn),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Find customer"
        description="Look someone up by name to award points or redeem a reward at the counter."
        meta={
          <span className="text-muted-foreground text-xs tabular-nums">
            {customers.length} matching
          </span>
        }
      />

      <DataTable
        label="Customer lookup"
        columns={columns}
        rows={customers}
        getRowKey={(customer) => customer.id}
        toolbar={
          <SearchForm
            label="Search customers"
            placeholder="Name…"
            defaultValue={search}
          />
        }
        empty={
          <EmptyState
            title={search ? `No customers match “${search}”` : "No customers"}
            description={
              search
                ? "Check the spelling, or clear the search to browse everyone."
                : "Customers appear once they join the program."
            }
          />
        }
      />
    </PageContainer>
  );
}
