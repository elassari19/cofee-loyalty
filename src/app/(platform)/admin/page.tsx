import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRightIcon,
  Building2Icon,
  StoreIcon,
  UserRoundIcon,
  ZapIcon,
} from "lucide-react";

import { requirePageAccess } from "@/auth/guard";
import { MetricCard } from "@/components/patterns/metric-card";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getPlatformMetrics,
  getRecentMerchants,
} from "@/features/platform/queries";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = {
  title: "Platform overview",
};

export default async function PlatformOverviewPage() {
  const auth = await requirePageAccess("platform.manage");
  const metrics = await getPlatformMetrics();
  const recent = await getRecentMerchants();

  return (
    <PageContainer>
      <PageHeader
        title={`Welcome back, ${auth.displayName.split(" ")[0]}`}
        description="Merchants, subscriptions and platform health across the whole tenant base."
        actions={
          <Button variant="outline" render={<Link href="/admin/merchants" />}>
            Manage merchants
            <ArrowRightIcon />
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Merchants"
          value={formatNumber(metrics.merchants)}
          hint={`${metrics.active} active · onboarding continues`}
          icon={StoreIcon}
        />
        <MetricCard
          label="Active customers"
          value={formatNumber(metrics.customers)}
          hint="Across all merchant programs"
          icon={UserRoundIcon}
        />
        <MetricCard
          label="Points issued"
          value={formatNumber(metrics.pointsIssued)}
          hint="Rolling six-month window"
          icon={ZapIcon}
        />
        <MetricCard
          label="Tenants"
          value={formatNumber(metrics.merchants)}
          hint="Isolated merchant workspaces"
          icon={Building2Icon}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recently joined merchants</CardTitle>
          <CardDescription>
            Latest tenants on the platform, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table aria-label="Recently joined merchants">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Merchant</TableHead>
                <TableHead scope="col">Plan</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col" className="text-right">
                  Customers
                </TableHead>
                <TableHead scope="col">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((merchant) => (
                <TableRow key={merchant.id}>
                  <TableCell className="font-medium">{merchant.name}</TableCell>
                  <TableCell>{merchant.plan}</TableCell>
                  <TableCell>
                    <StatusBadge status={merchant.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(merchant.customers)}
                  </TableCell>
                  <TableCell>{merchant.joinedOn}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter>
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/admin/merchants" />}
          >
            View all merchants
            <ArrowRightIcon />
          </Button>
        </CardFooter>
      </Card>
    </PageContainer>
  );
}
