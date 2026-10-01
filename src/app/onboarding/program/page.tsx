import type { Metadata } from "next";

import { STEP_COPY } from "@/features/merchants/onboarding";
import {
  emptyProgramFormValues,
  programFormValues,
} from "@/features/loyalty/schemas";
import { OnboardingStepper } from "@/components/merchants/onboarding-stepper";
import { ProgramForm } from "@/components/loyalty/program-form";
import { ProgramPreview } from "@/components/loyalty/program-preview";
import { StatusBadge } from "@/components/patterns/status-badge";
import { PageHeader } from "@/components/patterns/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { requireStep } from "../onboarding-context";

export const metadata: Metadata = {
  title: "Loyalty model & rules",
};

/**
 * Wizard step 2 — loyalty model and rules (checklist §6 bullets 2–5).
 *
 * The model choice is locked once it would be unsafe to change: an active
 * program or an existing reward already refers to one unit. Everything else
 * is saved as a draft — activation happens on the launch step — and the
 * preview beside the form always renders the *stored* rules, so what the
 * merchant reads is what customers will read.
 */
export default async function OnboardingProgramPage() {
  const { state } = await requireStep("program");
  const { merchant, program, rewards, steps } = state;

  const typeLocked = program?.status === "active" || rewards.length > 0;

  return (
    <>
      <PageHeader
        title="Loyalty model & rules"
        description={STEP_COPY.program.description}
        meta={
          program ? (
            <>
              <StatusBadge status={program.status} />
              <span className="text-muted-foreground text-sm">
                Rules version {program.ruleVersion}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground text-sm">
              Not configured yet
            </span>
          )
        }
      />

      <OnboardingStepper steps={steps} current="program" />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Program rules</CardTitle>
            <CardDescription>
              Saving keeps the program a draft so you can refine it; nothing
              customers see changes until you activate on the final step.
              {typeLocked
                ? " The model is locked because your program already refers to its unit."
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProgramForm
              defaultValues={
                program
                  ? programFormValues({
                      type: program.type,
                      name: program.name,
                      description: program.description,
                      unitName: program.unitName,
                      configuration: program.configuration,
                    })
                  : emptyProgramFormValues()
              }
              typeLocked={typeLocked}
              submitLabel={
                program ? "Save program rules" : "Save rules & continue"
              }
              advance
            />
          </CardContent>
        </Card>

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
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Customer preview</CardTitle>
                <CardDescription>
                  Save your rules once and this panel shows exactly what
                  customers read before they join.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
