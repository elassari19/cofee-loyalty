import type { Metadata } from "next";

import { requirePageAccess } from "@/auth/guard";
import {
  listCustomerOffers,
  type CustomerContext,
} from "@/features/customers/service";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { EmptyState } from "@/components/patterns/states";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate, localDay } from "@/lib/format";

import { loadMembershipState, renderMembership } from "../state";

export const metadata: Metadata = {
  title: "Offers",
};

export default async function CustomerOffersPage() {
  const auth = await requirePageAccess("campaigns.read");
  const state = await loadMembershipState(auth);

  return renderMembership(state, auth.displayName, (ctx) => (
    <Offers key={ctx.merchant.id} ctx={ctx} />
  ));
}

/**
 * Live and upcoming campaigns for the member's own program (checklist §7
 * bullet 5). The query behind it is tenant-scoped and excludes drafts and
 * ended campaigns, so this screen can only ever show this program's
 * marketing rows — never another merchant's.
 */
async function Offers({ ctx }: { ctx: CustomerContext }) {
  const offers = await listCustomerOffers(ctx);

  return (
    <PageContainer>
      <PageHeader
        title="Offers"
        description={`Campaigns and bonuses running on ${ctx.merchant.name}.`}
        meta={
          <span className="text-muted-foreground text-xs tabular-nums">
            {offers.length} available
          </span>
        }
      />

      {offers.length === 0 ? (
        <EmptyState
          title="No offers right now"
          description="New campaigns show up here as soon as they go live."
        />
      ) : (
        <ul aria-label="Current offers" className="grid gap-4 sm:grid-cols-2">
          {offers.map((offer) => (
            <li key={offer.id}>
              <Card className="h-full gap-3 py-4">
                <CardHeader className="gap-2">
                  <CardTitle className="flex items-start justify-between gap-2 text-base">
                    <span className="min-w-0">{offer.name}</span>
                    <StatusBadge
                      status={offer.live ? "live" : "scheduled"}
                      label={offer.live ? "Live now" : "Scheduled"}
                    />
                  </CardTitle>
                  <CardDescription>
                    {formatDate(localDay(offer.startAt))} →{" "}
                    {formatDate(localDay(offer.endAt))}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {offer.description ? (
                    <p className="text-sm leading-relaxed">
                      {offer.description}
                    </p>
                  ) : null}
                  {offer.terms ? (
                    <p className="text-muted-foreground text-xs">
                      {offer.terms}
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
