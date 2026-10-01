import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightIcon, GiftIcon } from "lucide-react";

import { STEP_COPY } from "@/features/merchants/onboarding";
import { OnboardingStepper } from "@/components/merchants/onboarding-stepper";
import { ProgramPreview } from "@/components/loyalty/program-preview";
import { RewardForm } from "@/components/loyalty/reward-form";
import { StatusBadge } from "@/components/patterns/status-badge";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { requireStep } from "../onboarding-context";

export const metadata: Metadata = {
  title: "First reward",
};

/**
 * Wizard step 3 — first reward (checklist §6 bullet 6).
 *
 * The step completes as soon as one reward exists; the form stays available
 * afterwards for adding more. The reward's unit comes from the stored
 * program, so a points program and a stamp card can never mix units even if
 * a crafted payload claims otherwise — the server derives it again inside
 * the action.
 */
export default async function OnboardingRewardPage() {
  const { state } = await requireStep("reward");
  const { merchant, program, rewards, steps } = state;

  // `prerequisitesMet` guarantees the program step is complete, so a program
  // row exists; the fallback keeps TypeScript (and an empty configuration)
  // honest anyway.
  const type = program?.type ?? "POINTS";
  const unitLabel =
    program?.unitName ?? (type === "POINTS" ? "points" : "stamps");

  return (
    <>
      <PageHeader
        title="First reward"
        description={STEP_COPY.reward.description}
        actions={
          rewards.length > 0 ? (
            <Button
              variant="outline"
              render={<Link href="/onboarding/launch" />}
            >
              Continue to launch
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          ) : null
        }
      />

      <OnboardingStepper steps={steps} current="reward" />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {rewards.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GiftIcon aria-hidden="true" className="size-4" />
                  Your rewards
                </CardTitle>
                <CardDescription>
                  {rewards.length} reward
                  {rewards.length === 1 ? "" : "s"} available for redemption.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-border divide-y">
                  {rewards.map((reward) => (
                    <li
                      key={reward.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">
                          {reward.name}
                        </span>
                        {reward.description ? (
                          <span className="text-muted-foreground truncate text-xs">
                            {reward.description}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="secondary">
                          {reward.cost} {unitLabel}
                        </Badge>
                        <StatusBadge status={reward.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>
                {rewards.length > 0
                  ? "Add another reward"
                  : "Create your first reward"}
              </CardTitle>
              <CardDescription>
                The benefit customers unlock — at least one reward is required
                before you can activate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RewardForm
                unitLabel={unitLabel}
                submitLabel={
                  rewards.length > 0
                    ? "Create reward"
                    : "Create reward & continue"
                }
              />
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          {program ? (
            <ProgramPreview
              businessName={merchant.name}
              programName={program.name}
              description={program.description}
              type={program.type}
              unitName={program.unitName}
              configuration={program.configuration}
              currency={merchant.currency}
              rewards={rewards.map((reward) => ({
                id: reward.id,
                name: reward.name,
                description: reward.description,
                cost: reward.cost,
              }))}
            />
          ) : null}
        </aside>
      </div>
    </>
  );
}
