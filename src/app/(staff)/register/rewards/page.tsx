import type { Metadata } from "next";

import { requirePageAccess } from "@/auth/guard";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";

import { RedeemPanel } from "./redeem-panel";

export const metadata: Metadata = {
  title: "Redeem reward",
};

/**
 * Counter redemption (checklist §9 bullets 6–8, PRD §20).
 *
 * The page itself is deliberately thin: all data arrives from the two actions
 * the panel drives — verify, then redeem — so what the cashier sees is always
 * what the server just re-checked. `rewards.redeem` is the guard, and the
 * service refuses a customer session again, so only a counter role can stand
 * in as the verifier of record.
 */
export default async function StaffRewardsPage() {
  await requirePageAccess("rewards.redeem");

  return (
    <PageContainer>
      <PageHeader
        title="Redeem reward"
        description="Enter the code the customer shows you, verify it, then redeem. Verifying records who checked the code; only redeeming spends their value."
      />
      <RedeemPanel />
    </PageContainer>
  );
}
