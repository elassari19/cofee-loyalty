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
import { listCustomers, searchCustomers } from "@/lib/demo-store";

export const metadata: Metadata = {
  title: "Customers",
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await requirePageAccess("customers.read");
  const query = (await searchParams).q;
  const search = (typeof query === "string" ? query : "").trim();

  const customers = searchCustomers(search);
  const total = listCustomers().length;

  const columns: DataTableColumn<Customer>[] = [
    {
      key: "customer",
      header: "Customer",
      cell: (customer) => (
        <div className="flex flex-col">
          <span className="font-medium">{customer.name}</span>
          <span className="text-muted-foreground text-xs">
            {customer.email}
          </span>
        </div>
      ),
    },
    {
      key: "points",
      header: "Points",
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
      header: "Last activity",
      cell: (customer) => formatDate(customer.lastActivityOn),
    },
    {
      key: "joined",
      header: "Joined",
      cell: (customer) => formatDate(customer.joinedOn),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Customers"
        description="Everyone enrolled in this program with their balance, tier and recency."
        meta={
          <span className="text-muted-foreground text-xs tabular-nums">
            {customers.length} of {total} shown
          </span>
        }
      />

      <DataTable
        label="Program customers"
        columns={columns}
        rows={customers}
        getRowKey={(customer) => customer.id}
        toolbar={
          <SearchForm
            label="Search customers"
            placeholder="Name or email…"
            defaultValue={search}
          />
        }
        empty={
          <EmptyState
            title={
              search ? `No customers match “${search}”` : "No customers yet"
            }
            description={
              search
                ? "Check the spelling, or clear the search to see everyone enrolled."
                : "Customers appear here as soon as they join the program from the counter or a join link."
            }
          />
        }
      />
    </PageContainer>
  );
}
