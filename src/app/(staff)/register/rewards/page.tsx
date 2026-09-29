import type { Metadata } from "next";

import { requirePageAccess } from "@/auth/guard";
import { EmptyState } from "@/components/patterns/states";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { listCustomers, listRewards } from "@/lib/demo-store";

import { RedeemPanel } from "./redeem-panel";

export const metadata: Metadata = {
  title: "Redeem reward",
};

export default async function StaffRewardsPage() {
  await requirePageAccess("rewards.read");
  const rewards = listRewards();
  const customers = listCustomers()
    .filter((customer) => customer.status === "active")
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      points: customer.points,
    }));

  return (
    <PageContainer>
      <PageHeader
        title="Redeem reward"
        description="Pick the customer, choose a reward they can afford, and confirm — the balance updates immediately."
      />

      {rewards.length === 0 ? (
        <EmptyState
          title="No rewards to redeem"
          description="Rewards created by the owner appear here as soon as they are active."
        />
      ) : (
        <RedeemPanel customers={customers} rewards={rewards} />
      )}
    </PageContainer>
  );
}
