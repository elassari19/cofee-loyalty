import type { Metadata } from "next";
import { GiftIcon, RepeatIcon, UserRoundIcon, ZapIcon } from "lucide-react";

import { requirePageAccess } from "@/auth/guard";
import { MetricCard } from "@/components/patterns/metric-card";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
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
  getMerchantAnalytics,
  getMerchantMonthlyPoints,
  getRewardPerformance,
} from "@/features/analytics/queries";
import { formatNumber, formatPercent } from "@/lib/format";

export const metadata: Metadata = {
  title: "Analytics",
};

export default async function MerchantAnalyticsPage() {
  const auth = await requirePageAccess("analytics.read");

  // In preview mode merchantId might be null, fallback to a query that works or a known ID.
  // We'll require a valid merchantId for real DB queries.
  let metrics = {
    activeCustomers: 0,
    pointsIssued: 0,
    pointsRedeemed: 0,
    redemptions: 0,
    redemptionRate: 0,
  };
  let monthly: { month: string; pointsIssued: number }[] = [];
  let rewards: {
    id: string;
    name: string;
    cost: number;
    active: boolean;
    redeemed: number;
  }[] = [];

  if (auth.merchantId) {
    metrics = await getMerchantAnalytics(auth.merchantId);
    monthly = await getMerchantMonthlyPoints(auth.merchantId);
    rewards = await getRewardPerformance(auth.merchantId);
  } else {
    // Demo fallback for preview roles
    metrics = {
      activeCustomers: 1284,
      pointsIssued: 35400,
      pointsRedeemed: 12000,
      redemptions: 80,
      redemptionRate: 0.15,
    };
    monthly = [{ month: "Sep", pointsIssued: 35400 }];
    rewards = [
      { id: "r1", name: "Free latte", cost: 500, active: true, redeemed: 38 },
    ];
  }

  const maxPoints = Math.max(...monthly.map((entry) => entry.pointsIssued), 1);
  const totalRedeemed = rewards.reduce(
    (sum, reward) => sum + reward.redeemed,
    0,
  );

  return (
    <PageContainer>
      <PageHeader
        title="Analytics"
        description="Loyalty volume and reward performance for this program."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Active customers"
          value={formatNumber(metrics.activeCustomers)}
          hint="Eligible to earn and redeem"
          icon={UserRoundIcon}
        />
        <MetricCard
          label="Points issued"
          value={formatNumber(metrics.pointsIssued)}
          hint="Earn and adjustment entries"
          icon={ZapIcon}
        />
        <MetricCard
          label="Points redeemed"
          value={formatNumber(metrics.pointsRedeemed)}
          hint={`${metrics.redemptions} redemptions`}
          icon={GiftIcon}
        />
        <MetricCard
          label="Redemption rate"
          value={formatPercent(metrics.redemptionRate)}
          hint="Redemptions ÷ total activity"
          icon={RepeatIcon}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Points issued by month</CardTitle>
          <CardDescription>Six-month trend, all customers.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          {monthly.map((entry) => (
            <div key={entry.month} className="flex items-center gap-3">
              <span className="text-muted-foreground w-8 shrink-0 text-xs">
                {entry.month}
              </span>
              <span
                aria-hidden="true"
                className="bg-muted h-3 min-w-8 flex-1 overflow-hidden rounded-sm"
              >
                <span
                  className="bg-foreground/85 block h-full rounded-sm"
                  style={{
                    width: `${Math.round((entry.pointsIssued / maxPoints) * 100)}%`,
                  }}
                />
              </span>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums">
                {formatNumber(entry.pointsIssued)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reward performance</CardTitle>
          <CardDescription>Redemptions per reward, all time.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table aria-label="Reward performance">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Reward</TableHead>
                <TableHead scope="col" className="text-right">
                  Cost
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Redeemed
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Share
                </TableHead>
                <TableHead scope="col">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rewards.map((reward) => (
                <TableRow key={reward.id}>
                  <TableCell className="font-medium">{reward.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(reward.cost)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(reward.redeemed)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(
                      totalRedeemed === 0 ? 0 : reward.redeemed / totalRedeemed,
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={reward.active ? "active" : "disabled"}
                      label={reward.active ? "Active" : "Paused"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
