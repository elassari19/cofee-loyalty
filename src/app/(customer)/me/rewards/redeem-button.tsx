"use client";

import { useRouter } from "next/navigation";

import { redeemRewardAction } from "@/lib/actions";
import { formatNumber } from "@/lib/format";
import { ConfirmButton } from "@/components/patterns/confirm";
import { notify } from "@/components/patterns/toast";

export function CustomerRedeemButton({
  rewardId,
  rewardName,
  cost,
  customerId,
  disabled,
  hint,
}: {
  rewardId: string;
  rewardName: string;
  cost: number;
  customerId: string;
  disabled: boolean;
  hint: string | null;
}) {
  const router = useRouter();

  return (
    <>
      <ConfirmButton
        destructive
        disabled={disabled}
        title={`Redeem “${rewardName}”?`}
        description={`This spends ${formatNumber(cost)} points from your balance and records the redemption immediately. It can't be undone from here.`}
        confirmLabel="Redeem reward"
        onConfirm={async () => {
          const result = await redeemRewardAction({ rewardId, customerId });
          if (!result.ok) throw new Error(result.message);
          notify.success(
            `“${result.data.rewardName}” is yours — ${formatNumber(result.data.balance)} points left.`,
          );
          router.refresh();
        }}
        className="w-full"
      >
        Redeem
      </ConfirmButton>
      {hint ? (
        <p className="text-muted-foreground text-center text-xs">{hint}</p>
      ) : null}
    </>
  );
}
