import type { Metadata } from "next";

import { requirePageAccess } from "@/auth/guard";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/patterns/data-table";
import { EmptyState } from "@/components/patterns/states";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { formatDate } from "@/lib/format";

import { listStaff } from "@/features/merchants/service";

export const metadata: Metadata = {
  title: "Staff",
};

export default async function StaffPage() {
  const auth = await requirePageAccess("staff.read");
  const staff = await listStaff(auth.merchantId!);

  const columns: DataTableColumn<any>[] = [
    {
      key: "member",
      header: "Team member",
      cell: (member) => (
        <div className="flex flex-col">
          <span className="font-medium">{member.name}</span>
          <span className="text-muted-foreground text-xs">{member.email}</span>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (member) => (
        <StatusBadge
          status={member.role === "Owner" ? "live" : "outline"}
          label={member.role}
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (member) => <StatusBadge status={member.status} />,
    },
    {
      key: "lastActive",
      header: "Last active",
      cell: (member) =>
        member.lastActiveOn === "—" ? (
          <span className="text-muted-foreground">Never</span>
        ) : (
          formatDate(member.lastActiveOn)
        ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Staff"
        description="Who can ring up purchases and redeem rewards at the counter. Invitations and role changes arrive with §10."
        meta={
          <span className="text-muted-foreground text-xs tabular-nums">
            {staff.filter((member: any) => member.status === "active").length}{" "}
            active · {staff.length} total
          </span>
        }
      />

      <DataTable
        label="Staff roster"
        columns={columns}
        rows={staff}
        getRowKey={(member: any) => member.id}
        empty={
          <EmptyState
            title="No team members yet"
            description="Invite cashiers and managers so they can sign in to the register."
          />
        }
      />
    </PageContainer>
  );
}
