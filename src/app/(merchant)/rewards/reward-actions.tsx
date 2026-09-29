"use client";

import { useRouter } from "next/navigation";
import { PauseIcon, PlayIcon } from "lucide-react";

import { setRewardActiveAction } from "@/lib/actions";
import type { Reward } from "@/lib/demo-store";
import { formatNumber } from "@/lib/format";
import { ConfirmButton } from "@/components/patterns/confirm";

/**
 * Activation toggle (checklist §3 bullet 5): pausing a reward is
 * value-affecting, so it always goes through an explicit confirmation that
 * states the consequence, and the toast reports what actually happened.
 * The button itself stays neutral — pausing is reversible, unlike a
 * redemption that spends a customer's points.
 */
export function RewardActions({ reward }: { reward: Reward }) {
  const router = useRouter();
  const activating = !reward.active;

  return (
    <ConfirmButton
      size="sm"
      title={
        activating ? `Activate “${reward.name}”?` : `Pause “${reward.name}”?`
      }
      description={
        activating
          ? `Customers will be able to redeem this reward again as soon as it is active.`
          : `This stops new redemptions of “${reward.name}” immediately. Redemptions already completed are not affected.`
      }
      confirmLabel={activating ? "Activate" : "Pause"}
      onConfirm={async () => {
        const result = await setRewardActiveAction(reward.id, activating);
        if (!result.ok) throw new Error(result.message);
        router.refresh();
      }}
      successMessage={
        activating
          ? `“${reward.name}” is active — customers can redeem it for ${formatNumber(reward.cost)} points.`
          : `“${reward.name}” paused. Customers can no longer redeem it.`
      }
    >
      {activating ? (
        <>
          <PlayIcon aria-hidden="true" />
          Activate
        </>
      ) : (
        <>
          <PauseIcon aria-hidden="true" />
          Pause
        </>
      )}
    </ConfirmButton>
  );
}
