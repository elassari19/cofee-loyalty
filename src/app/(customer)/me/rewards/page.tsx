import type { Metadata } from "next";

import { requirePageAccess } from "@/auth/guard";
import { EmptyState } from "@/components/patterns/states";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CURRENT_CUSTOMER_ID,
  getCurrentCustomer,
  listRewards,
} from "@/lib/demo-store";
import { formatNumber } from "@/lib/format";

import { CustomerRedeemButton } from "./redeem-button";

export const metadata: Metadata = {
  title: "Rewards",
};

export default async function CustomerRewardsPage() {
  await requirePageAccess("rewards.read");
  const customer = getCurrentCustomer();
  const rewards = listRewards();

  return (
    <PageContainer>
      <PageHeader
        title="Rewards"
        description="Everything you can exchange points for on this program."
        meta={
          <Badge variant="secondary">
            Your balance: {formatNumber(customer.points)} pts
          </Badge>
        }
      />

      {rewards.length === 0 ? (
        <EmptyState
          title="No rewards available yet"
          description="New rewards appear here as soon as the program adds them."
        />
      ) : (
        <ul
          aria-label="Available rewards"
          className="grid gap-4 sm:grid-cols-2"
        >
          {rewards.map((reward) => {
            const affordable = reward.active && customer.points >= reward.cost;
            return (
              <li key={reward.id}>
                <Card className="h-full gap-3 py-4">
                  <CardHeader className="gap-2">
                    <CardTitle className="flex items-start justify-between gap-2 text-base">
                      <span className="min-w-0">{reward.name}</span>
                      <StatusBadge
                        status={reward.active ? "active" : "disabled"}
                        label={reward.active ? "Active" : "Paused"}
                      />
                    </CardTitle>
                    <CardDescription>{reward.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline">
                        {formatNumber(reward.cost)} pts
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {reward.active
                          ? `${formatNumber(reward.redeemed)} redeemed`
                          : "Currently paused"}
                      </span>
                    </div>
                    <CustomerRedeemButton
                      rewardId={reward.id}
                      rewardName={reward.name}
                      cost={reward.cost}
                      customerId={CURRENT_CUSTOMER_ID}
                      disabled={!affordable}
                      hint={
                        !reward.active
                          ? "This reward is paused right now."
                          : customer.points < reward.cost
                            ? `You need ${formatNumber(reward.cost - customer.points)} more points.`
                            : null
                      }
                    />
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
