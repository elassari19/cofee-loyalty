import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRightIcon,
  CreditCardIcon,
  GiftIcon,
  SparklesIcon,
} from "lucide-react";

import { requirePageAccess } from "@/auth/guard";
import {
  loadCustomerOverview,
  type CustomerContext,
} from "@/features/customers/service";
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
import { formatNumber } from "@/lib/format";

import { CardActions } from "./card-actions";
import { loadMembershipState, renderMembership } from "./state";

export const metadata: Metadata = {
  title: "Overview",
};

/**
 * The member's dashboard (checklist §7 bullet 5, PRD §16).
 *
 * Every number here is scoped to the one membership the session resolved —
 * balance, ledger rows, rewards, offers and card all come from the same
 * `CustomerContext`, so there is no parameter on this page that could show
 * another member's or another tenant's data.
 */
export default async function CustomerHomePage() {
  const auth = await requirePageAccess("loyalty.read");
  const state = await loadMembershipState(auth);

  return renderMembership(state, auth.displayName, (ctx) => (
    <Overview key={ctx.merchant.id} ctx={ctx} />
  ));
}

async function Overview({ ctx }: { ctx: CustomerContext }) {
  const overview = await loadCustomerOverview(ctx);
  const { progress } = ctx;
  const unit = progress.unit;
  const firstName = ctx.profile.name.trim().split(/\s+/)[0] ?? ctx.profile.name;

  const headline = progress.complete
    ? `Every ${unit} milestone reached — enjoy them.`
    : progress.target !== null
      ? `${formatNumber(progress.target - progress.balance)} ${unit} to ${
          progress.label ?? "the next milestone"
        }`
      : ctx.program
        ? "The program's rules aren't complete yet."
        : "This program hasn't been published yet.";

  return (
    <PageContainer>
      <PageHeader
        title={`Hi, ${firstName}`}
        description={`Your balance, rewards and the latest activity on your card at ${ctx.merchant.name}.`}
        meta={
          <>
            <Badge variant="secondary">{ctx.merchant.name}</Badge>
            <Badge variant="outline">
              {ctx.program ? ctx.program.name : "Loyalty card"}
            </Badge>
            {ctx.memberships.length > 1 ? (
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/choose-merchant" />}
              >
                Switch program
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SparklesIcon aria-hidden="true" className="size-4" />
              {unit.charAt(0).toUpperCase() + unit.slice(1)} balance
            </CardTitle>
            <CardDescription>{headline}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-4xl font-semibold tracking-tight tabular-nums">
              {formatNumber(progress.balance)}
              <span className="text-muted-foreground ml-2 text-base font-normal">
                {unit}
              </span>
            </p>
            {progress.target !== null && !progress.complete ? (
              <Progress value={progress.percent} aria-label={headline}>
                <span className="text-muted-foreground text-xs">
                  {formatNumber(progress.balance)} /{" "}
                  {formatNumber(progress.target)}
                </span>
                <ProgressValue />
              </Progress>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/me/rewards" />}
              >
                Browse rewards
                <ArrowRightIcon aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/me/activity" />}
              >
                See activity
                <ArrowRightIcon aria-hidden="true" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCardIcon aria-hidden="true" className="size-4" />
              Your loyalty card
            </CardTitle>
            <CardDescription>
              Show it at the counter. The code is opaque — it carries no name,
              email or member number.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            {overview.identity ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={overview.identity.qrDataUrl}
                  alt={`Loyalty card for ${ctx.merchant.name}`}
                  className="bg-background size-40 rounded-md border p-2"
                />
                <code className="bg-muted rounded px-2 py-1 text-xs break-all">
                  {overview.identity.payload}
                </code>
                <CardActions payload={overview.identity.payload} />
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                No card has been issued for this membership yet — re-join from
                the merchant&apos;s link to issue one.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
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
            {overview.affordable.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Keep earning — you&apos;ll unlock rewards as your balance grows.
              </p>
            ) : (
              overview.affordable.map((reward) => (
                <div
                  key={reward.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {reward.name}
                  </span>
                  <Badge variant="secondary">
                    {formatNumber(reward.cost)} {unit}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>
              Your latest earn and redemption entries.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {overview.recentActivity.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No activity yet — your first purchase will show up here.
              </p>
            ) : (
              overview.recentActivity.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{row.detail}</span>
                    <span className="text-muted-foreground block text-xs">
                      {row.subtitle}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 font-medium tabular-nums ${
                      row.delta < 0 ? "text-destructive" : ""
                    }`}
                  >
                    {row.amountLabel}
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
            {overview.offers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No live offers right now — check back soon.
              </p>
            ) : (
              overview.offers.map((offer) => (
                <div key={offer.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{offer.name}</span>
                    <StatusBadge
                      status={offer.live ? "live" : "scheduled"}
                      label={offer.live ? "Live now" : "Scheduled"}
                    />
                  </div>
                  {offer.terms ? (
                    <p className="text-muted-foreground text-xs">
                      {offer.terms}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
