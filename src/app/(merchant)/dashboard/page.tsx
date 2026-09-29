import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightIcon, GiftIcon, MegaphoneIcon, ZapIcon } from "lucide-react";

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
  getBusiness,
  listRewards,
  listTransactions,
  merchantMetrics,
} from "@/lib/demo-store";
import { formatNumber, formatPercent, formatSignedPoints } from "@/lib/format";

export const metadata: Metadata = {
  title: "Dashboard",
};

const TYPE_LABEL: Record<string, string> = {
  earn: "Earn",
  redeem: "Redeem",
  adjustment: "Adjustment",
};

export default async function DashboardPage() {
  await requirePageAccess("analytics.read");
  const metrics = merchantMetrics();
  const recent = listTransactions().slice(0, 6);
  const topRewards = listRewards()
    .slice()
    .sort((a, b) => b.redeemed - a.redeemed)
    .slice(0, 3);
  const business = getBusiness();

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description={`${business.storeName} — today's loyalty activity across the counter and the program.`}
        actions={
          <Button variant="outline" render={<Link href="/analytics" />}>
            Full analytics
            <ArrowRightIcon />
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Active customers"
          value={formatNumber(metrics.activeCustomers)}
          hint="With at least one visit on record"
        />
        <MetricCard
          label="Points issued"
          value={formatNumber(metrics.pointsIssued)}
          hint="All earn and adjustment entries"
          icon={ZapIcon}
        />
        <MetricCard
          label="Points redeemed"
          value={formatNumber(metrics.pointsRedeemed)}
          hint={`${metrics.redemptions} redemption transactions`}
          icon={GiftIcon}
        />
        <MetricCard
          label="Redemption rate"
          value={formatPercent(metrics.redemptionRate)}
          hint="Redemptions as a share of activity"
          icon={MegaphoneIcon}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>
            The latest earn, redemption and adjustment entries on this
            program&apos;s ledger.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table aria-label="Recent loyalty activity">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Customer</TableHead>
                <TableHead scope="col">Type</TableHead>
                <TableHead scope="col" className="text-right">
                  Points
                </TableHead>
                <TableHead scope="col">Staff</TableHead>
                <TableHead scope="col">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-medium">
                    {transaction.customerName}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={transaction.type}
                      label={TYPE_LABEL[transaction.type] ?? transaction.type}
                    />
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium tabular-nums ${
                      transaction.points < 0 ? "text-destructive" : ""
                    }`}
                  >
                    {formatSignedPoints(transaction.points)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {transaction.staff}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {transaction.note}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter>
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/transactions" />}
          >
            View all transactions
            <ArrowRightIcon />
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top rewards</CardTitle>
          <CardDescription>
            Most redeemed rewards on the program.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {topRewards.map((reward) => (
            <div
              key={reward.id}
              className="flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{reward.name}</p>
                <p className="text-muted-foreground text-xs">
                  {formatNumber(reward.cost)} points
                </p>
              </div>
              <span className="text-sm tabular-nums">
                {formatNumber(reward.redeemed)} redeemed
              </span>
            </div>
          ))}
        </CardContent>
        <CardFooter>
          <Button variant="ghost" size="sm" render={<Link href="/rewards" />}>
            Manage rewards
            <ArrowRightIcon />
          </Button>
        </CardFooter>
      </Card>
    </PageContainer>
  );
}
