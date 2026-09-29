import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightIcon, GiftIcon, SparklesIcon } from "lucide-react";

import { requirePageAccess } from "@/auth/guard";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress, ProgressValue } from "@/components/ui/progress";
import {
  CURRENT_CUSTOMER_ID,
  getCurrentCustomer,
  listCampaigns,
  listRewards,
  listTransactions,
} from "@/lib/demo-store";
import { formatNumber, formatSignedPoints } from "@/lib/format";

export const metadata: Metadata = {
  title: "Overview",
};

const TIERS = [
  { name: "Bronze", at: 0 },
  { name: "Silver", at: 500 },
  { name: "Gold", at: 1000 },
] as const;

function tierProgress(points: number) {
  const current =
    [...TIERS].reverse().find((tier) => points >= tier.at) ?? TIERS[0];
  const next = TIERS.find((tier) => tier.at > points);
  if (!next) return { current, next: null, percent: 100 };
  const span = next.at - current.at;
  const percent = Math.min(
    100,
    Math.max(0, Math.round(((points - current.at) / span) * 100)),
  );
  return { current, next, percent };
}

export default async function CustomerHomePage() {
  await requirePageAccess("loyalty.read");
  const customer = getCurrentCustomer();
  const progress = tierProgress(customer.points);
  const rewards = listRewards().filter((reward) => reward.active);
  const affordable = rewards
    .filter((reward) => reward.cost <= customer.points)
    .slice(0, 2);
  const recent = listTransactions({ customerId: CURRENT_CUSTOMER_ID }).slice(
    0,
    4,
  );
  const offers = listCampaigns().filter(
    (campaign) => campaign.status === "live",
  );

  return (
    <PageContainer>
      <PageHeader
        title={`Hi, ${customer.name.split(" ")[0]}`}
        description="Your balance, rewards and the latest activity on this loyalty card."
        meta={
          <StatusBadge status={customer.tier} label={`${customer.tier} tier`} />
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SparklesIcon aria-hidden="true" className="size-4" />
              Points balance
            </CardTitle>
            <CardDescription>
              {progress.next
                ? `${formatNumber(progress.next.at - customer.points)} points to ${progress.next.name}`
                : "Top tier reached — enjoy the perks."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-4xl font-semibold tracking-tight tabular-nums">
              {formatNumber(customer.points)}
              <span className="text-muted-foreground ml-2 text-base font-normal">
                points
              </span>
            </p>
            <Progress
              value={progress.percent}
              aria-label={`${progress.current.name} tier progress`}
            >
              <span className="text-muted-foreground text-xs">
                {progress.current.name}
                {progress.next ? ` → ${progress.next.name}` : ""}
              </span>
              <ProgressValue />
            </Progress>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/me/rewards" />}
              >
                Browse rewards
                <ArrowRightIcon />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/me/activity" />}
              >
                See activity
                <ArrowRightIcon />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GiftIcon aria-hidden="true" className="size-4" />
              You can redeem now
            </CardTitle>
            <CardDescription>
              Rewards within your current balance.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {affordable.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Keep earning — you&apos;ll unlock rewards as your balance grows.
              </p>
            ) : (
              affordable.map((reward) => (
                <div
                  key={reward.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {reward.name}
                  </span>
                  <Badge variant="secondary">
                    {formatNumber(reward.cost)} pts
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>
              Your latest earn and redemption entries.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {recent.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No activity yet — your first purchase will show up here.
              </p>
            ) : (
              recent.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{transaction.note}</span>
                    <span className="text-muted-foreground block text-xs">
                      {transaction.type === "earn"
                        ? "Purchase"
                        : transaction.type === "redeem"
                          ? "Reward redeemed"
                          : "Adjustment"}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 font-medium tabular-nums ${
                      transaction.points < 0 ? "text-destructive" : ""
                    }`}
                  >
                    {formatSignedPoints(transaction.points)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Offers for you</CardTitle>
            <CardDescription>
              Campaigns running on this program.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {offers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No live offers right now — check back soon.
              </p>
            ) : (
              offers.map((campaign) => (
                <div key={campaign.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{campaign.name}</span>
                    <StatusBadge status={campaign.status} />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {campaign.terms}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
