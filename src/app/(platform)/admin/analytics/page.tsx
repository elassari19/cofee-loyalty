import type { Metadata } from "next";
import { StoreIcon, UserRoundIcon, ZapIcon } from "lucide-react";

import { requirePageAccess } from "@/auth/guard";
import { MetricCard } from "@/components/patterns/metric-card";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getMonthly, listMerchants, platformMetrics } from "@/lib/demo-store";
import { formatNumber, formatPercent } from "@/lib/format";

export const metadata: Metadata = {
  title: "Platform analytics",
};

export default async function PlatformAnalyticsPage() {
  await requirePageAccess("platform.manage");
  const metrics = platformMetrics();
  const monthly = getMonthly();
  const maxPoints = Math.max(...monthly.map((entry) => entry.pointsIssued));
  const maxMerchants = Math.max(...monthly.map((entry) => entry.merchants));
  const trial = listMerchants().filter((m) => m.status === "trial").length;
  const activeShare =
    listMerchants().length === 0 ? 0 : metrics.active / listMerchants().length;

  return (
    <PageContainer>
      <PageHeader
        title="Platform analytics"
        description="Adoption and loyalty volume across every tenant, on a rolling six-month window."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Active share"
          value={formatPercent(activeShare)}
          hint={`${metrics.active} of ${metrics.merchants} merchants active`}
          icon={StoreIcon}
        />
        <MetricCard
          label="In trial"
          value={formatNumber(trial)}
          hint="Trials converting this quarter"
          icon={UserRoundIcon}
        />
        <MetricCard
          label="Points issued"
          value={formatNumber(metrics.pointsIssued)}
          hint="Sum across the six-month window"
          icon={ZapIcon}
        />
        <MetricCard
          label="Avg. per merchant"
          value={formatNumber(
            Math.round(metrics.pointsIssued / Math.max(monthly.length, 1)),
          )}
          hint="Points per month"
          icon={ZapIcon}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Points issued by month</CardTitle>
            <CardDescription>All tenants combined.</CardDescription>
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
            <CardTitle>Merchants added by month</CardTitle>
            <CardDescription>New tenants joining the platform.</CardDescription>
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
                      width: `${Math.round((entry.merchants / maxMerchants) * 100)}%`,
                    }}
                  />
                </span>
                <span className="w-14 shrink-0 text-right text-xs tabular-nums">
                  {formatNumber(entry.merchants)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
