import type { Metadata } from "next";

import { requirePageAccess } from "@/auth/guard";
import {
  listCustomerRewards,
  type CustomerContext,
} from "@/features/customers/service";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate, formatNumber, localDay } from "@/lib/format";

import { loadMembershipState, renderMembership } from "../state";

export const metadata: Metadata = {
  title: "Rewards",
};

/**
 * The member's reward catalogue (checklist §7 bullet 5).
 *
 * Read-only by design: issuing a redemption is the ledger/redemption flow of
 * §9, so this screen reports what the balance can reach and how far away the
 * rest are — it never mutates a balance itself.
 */
export default async function CustomerRewardsPage() {
  const auth = await requirePageAccess("rewards.read");
  const state = await loadMembershipState(auth);

  return renderMembership(state, auth.displayName, (ctx) => (
    <Rewards key={ctx.merchant.id} ctx={ctx} />
  ));
}

async function Rewards({ ctx }: { ctx: CustomerContext }) {
  const rewards = await listCustomerRewards(ctx);
  const unit = ctx.progress.unit;

  return (
    <PageContainer>
      <PageHeader
        title="Rewards"
        description={`Everything you can exchange ${unit} for on this program.`}
        meta={
          <Badge variant="secondary">
            Your balance: {formatNumber(ctx.membership.balance)} {unit}
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
          {rewards.map((reward) => (
            <li key={reward.id}>
              <Card className="h-full gap-3 py-4">
                <CardHeader className="gap-2">
                  <CardTitle className="flex items-start justify-between gap-2 text-base">
                    <span className="min-w-0">{reward.name}</span>
                    <Badge
                      variant={reward.affordable ? "secondary" : "outline"}
                    >
                      {formatNumber(reward.cost)} {unit}
                    </Badge>
                  </CardTitle>
                  <CardDescription>{reward.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto flex flex-col gap-2">
                  <p className="text-sm">
                    {reward.affordable ? (
                      <>Ready to redeem — show your card at the counter.</>
                    ) : (
                      <span className="text-muted-foreground">
                        You need {formatNumber(reward.shortage ?? 0)} more{" "}
                        {unit}.
                      </span>
                    )}
                  </p>
                  {reward.terms ? (
                    <p className="text-muted-foreground text-xs">
                      {reward.terms}
                    </p>
                  ) : null}
                  {reward.expiresAt ? (
                    <p className="text-muted-foreground text-xs">
                      Available until {formatDate(localDay(reward.expiresAt))}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
