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

import type { PlatformUser } from "@/lib/demo-store";
import { listPlatformUsers } from "@/lib/demo-store";

export const metadata: Metadata = {
  title: "Users",
};

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await requirePageAccess("platform.manage");
  const query = (await searchParams).q;
  const search = (typeof query === "string" ? query : "").trim().toLowerCase();

  const users = listPlatformUsers().filter(
    (user) =>
      !search ||
      user.name.toLowerCase().includes(search) ||
      user.email.toLowerCase().includes(search),
  );

  const columns: DataTableColumn<PlatformUser>[] = [
    {
      key: "user",
      header: "User",
      cell: (user) => (
        <div className="flex flex-col">
          <span className="font-medium">{user.name}</span>
          <span className="text-muted-foreground text-xs">{user.email}</span>
        </div>
      ),
    },
    { key: "role", header: "Role", cell: (user) => user.role },
    {
      key: "merchants",
      header: "Merchants",
      className: "text-right tabular-nums",
      cell: (user) => formatNumber(user.merchants),
    },
    {
      key: "status",
      header: "Status",
      cell: (user) => <StatusBadge status={user.status} />,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Users"
        description="Platform administrators and merchant owners with access to the console."
        meta={
          <span className="text-muted-foreground text-xs tabular-nums">
            {users.length} of {listPlatformUsers().length} shown
          </span>
        }
      />

      <DataTable
        label="Platform users"
        columns={columns}
        rows={users}
        getRowKey={(user) => user.id}
        toolbar={
          <SearchForm
            label="Search users"
            placeholder="Name or email…"
            defaultValue={search}
          />
        }
        empty={
          <EmptyState
            title={`No users match “${search}”`}
            description="Try a different name or email address."
          />
        }
      />
    </PageContainer>
  );
}
