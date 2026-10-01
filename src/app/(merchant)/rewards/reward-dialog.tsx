"use client";

import { useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";

import {
  emptyRewardFormValues,
  rewardFormValues,
  type RewardSummary,
} from "@/features/rewards/schemas";
import { RewardForm } from "@/components/loyalty/reward-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Create/edit entry point for a reward (checklist §9 bullet 1).
 *
 * One dialog, one form: `RewardForm` posts to the create action when there is
 * no `rewardId` and to the update action when there is, so both paths share
 * the schema, the field order and the server-side unit derivation. The dialog
 * closes itself on a successful save and the router refresh keeps the table
 * and the customer catalogue in step.
 */
export function RewardDialog({
  reward,
  unitLabel,
}: {
  /** Editing when present; otherwise this creates a new reward. */
  reward?: RewardSummary;
  unitLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const editing = reward !== undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant={editing ? "outline" : "default"} size="sm" />}
      >
        {editing ? (
          <>
            <PencilIcon aria-hidden="true" />
            Edit
          </>
        ) : (
          <>
            <PlusIcon aria-hidden="true" />
            New reward
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit “${reward.name}”` : "New reward"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes apply to new redemptions. Codes already issued keep the cost and terms they were issued with."
              : `Customers will see this reward in their portal. The cost is in your program's own unit — ${unitLabel}.`}
          </DialogDescription>
        </DialogHeader>
        <RewardForm
          unitLabel={unitLabel}
          rewardId={reward?.id}
          defaultValues={
            editing ? rewardFormValues(reward) : emptyRewardFormValues()
          }
          submitLabel={editing ? "Save changes" : "Create reward"}
          advance={false}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
