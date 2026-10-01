"use client";

import { useRouter } from "next/navigation";
import { PauseIcon, PlayIcon } from "lucide-react";

import { setRewardActiveAction } from "@/features/rewards/actions";
import type { RewardSummary } from "@/features/rewards/schemas";
import { formatNumber } from "@/lib/format";
import { ConfirmButton } from "@/components/patterns/confirm";

import { RewardDialog } from "./reward-dialog";

/**
 * Per-row actions (checklist §9 bullet 1): edit, plus the activation toggle.
 *
 * Pausing is value-affecting, so it goes through an explicit confirmation
 * that states the consequence, and the toast reports what actually happened
 * — the button itself stays neutral, because pausing is reversible. The
 * server checks `rewards.write` again, so hiding the button is convenience,
 * not security.
 */
export function RewardActions({
  reward,
  unitLabel,
}: {
  reward: RewardSummary;
  unitLabel: string;
}) {
  const router = useRouter();
  const activating = reward.status !== "active";

  return (
    <div className="flex items-center justify-end gap-2">
      <RewardDialog reward={reward} unitLabel={unitLabel} />
      <ConfirmButton
        size="sm"
        title={
          activating ? `Activate “${reward.name}”?` : `Pause “${reward.name}”?`
        }
        description={
          activating
            ? `Customers will be able to request codes for this reward again as soon as it is active.`
            : `This stops new codes for “${reward.name}” immediately. Codes already issued keep their value and can still be redeemed.`
        }
        confirmLabel={activating ? "Activate" : "Pause"}
        onConfirm={async () => {
          const result = await setRewardActiveAction(reward.id, activating);
          if (!result.ok) throw new Error(result.message);
          router.refresh();
        }}
        successMessage={
          activating
            ? `“${reward.name}” is active — customers can request it for ${formatNumber(reward.cost)}.`
            : `“${reward.name}” paused. No new codes will be issued.`
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
    </div>
  );
}
