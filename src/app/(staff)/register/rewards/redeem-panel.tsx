"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GiftIcon } from "lucide-react";

import { redeemRewardAction } from "@/lib/actions";
import type { Reward } from "@/lib/demo-store";
import { formatNumber } from "@/lib/format";
import { ConfirmButton } from "@/components/patterns/confirm";
import { notify } from "@/components/patterns/toast";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CustomerOption {
  id: string;
  name: string;
  points: number;
}

export function RedeemPanel({
  customers,
  rewards,
}: {
  customers: CustomerOption[];
  rewards: readonly Reward[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const customer = customers.find((option) => option.id === customerId);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Customer</CardTitle>
          <CardDescription>
            Balances shown are live — confirmations re-check them on the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="min-w-56 flex-1">
            <Label htmlFor="redeem-customer" className="sr-only">
              Redeeming customer
            </Label>
            <Select
              value={customerId}
              onValueChange={(value) => {
                if (value !== null) setCustomerId(value);
              }}
              items={Object.fromEntries(
                customers.map((option) => [option.id, option.name]),
              )}
            >
              <SelectTrigger id="redeem-customer" className="w-full">
                <SelectValue placeholder="Select customer…" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {customer ? (
            <p className="text-muted-foreground text-sm">
              Balance:{" "}
              <span className="text-foreground font-medium tabular-nums">
                {formatNumber(customer.points)} pts
              </span>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <ul aria-label="Redeemable rewards" className="grid gap-3 sm:grid-cols-2">
        {rewards.map((reward) => {
          const affordable =
            customer !== undefined && customer.points >= reward.cost;
          const disabled = !reward.active || !affordable || !customer;
          return (
            <li key={reward.id}>
              <Card className="h-full gap-3 py-4">
                <CardHeader className="gap-2">
                  <CardTitle className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <GiftIcon
                        aria-hidden="true"
                        className="text-muted-foreground size-4 shrink-0"
                      />
                      <span className="truncate">{reward.name}</span>
                    </span>
                    <StatusBadge
                      status={reward.active ? "active" : "disabled"}
                      label={reward.active ? "Active" : "Paused"}
                    />
                  </CardTitle>
                  <CardDescription>
                    {formatNumber(reward.cost)} points · {reward.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ConfirmButton
                    disabled={disabled}
                    destructive
                    title={`Redeem “${reward.name}”?`}
                    description={
                      customer
                        ? `This deducts ${formatNumber(reward.cost)} points from ${customer.name} and records a redemption. It cannot be undone from here.`
                        : "Select a customer first."
                    }
                    confirmLabel="Redeem reward"
                    onConfirm={async () => {
                      const result = await redeemRewardAction({
                        rewardId: reward.id,
                        customerId: customerId,
                      });
                      if (!result.ok) throw new Error(result.message);
                      notify.success(
                        `“${result.data.rewardName}” redeemed for ${result.data.customerName} — ${formatNumber(result.data.balance)} pts left.`,
                      );
                      router.refresh();
                    }}
                    className="w-full"
                  >
                    Redeem
                  </ConfirmButton>
                  {!reward.active ? (
                    <p className="text-muted-foreground mt-2 text-xs">
                      Paused — activate it from the merchant rewards page.
                    </p>
                  ) : !affordable && customer ? (
                    <p className="text-muted-foreground mt-2 text-xs">
                      {customer.name} needs {formatNumber(reward.cost)} points.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
