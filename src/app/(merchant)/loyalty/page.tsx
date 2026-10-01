import Link from "next/link";
import type { Metadata } from "next";
import { SparklesIcon } from "lucide-react";

import { can, requirePageAccess } from "@/auth/guard";
import { MerchantEntity } from "@/db/entities/merchant.entity";
import { getDb } from "@/db/connection";
import { findProgram } from "@/features/loyalty/service";
import { programFormValues } from "@/features/loyalty/schemas";
import { listRewards } from "@/features/rewards/service";
import { ProgramForm } from "@/components/loyalty/program-form";
import { ProgramPreview } from "@/components/loyalty/program-preview";
import { EmptyState } from "@/components/patterns/states";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Loyalty program",
};

/**
 * Loyalty program settings (checklist §6 bullets 2–5 — the edit half).
 *
 * The stored program is the single source of truth: the form edits it as a
 * draft through the same action the wizard uses, the preview beside it
 * renders that stored row (never a hand-written mock), and the model locks
 * once the program is active or rewards are priced in its unit — exactly the
 * condition the service enforces on a crafted request.
 */
export default async function LoyaltyPage() {
  const auth = await requirePageAccess("loyalty.read");
  const canWrite = can(auth, "loyalty.write");
  const db = await getDb();

  const merchant = auth.merchantId
    ? await db.getRepository(MerchantEntity).findOneBy({ id: auth.merchantId })
    : null;

  if (!merchant) {
    return (
      <PageContainer>
        <PageHeader
          title="Loyalty program"
          description="How customers earn and burn value. Changes apply to future transactions — ledger history is never rewritten."
        />
        <EmptyState
          icon={SparklesIcon}
          title="No active workspace"
          description="Program settings belong to a business workspace. Pick the workspace you're working in — preview contexts and accounts without an active membership land here too."
          action={
            <Button render={<Link href="/choose-merchant" />}>
              Choose a workspace
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const program = await findProgram(db.manager, merchant.id);
  if (!program) {
    return (
      <PageContainer>
        <PageHeader
          title="Loyalty program"
          description="Pick points or stamps, set the earning rules and create the first reward."
        />
        <EmptyState
          icon={SparklesIcon}
          title="No loyalty program yet"
          description="This business hasn't configured its program. The setup wizard takes you through the model, the rules and the first reward."
          action={
            <Button render={<Link href="/onboarding/program" />}>
              Set up the program
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const rewards = await listRewards(db.manager, merchant.id);
  const typeLocked = program.status === "active" || rewards.length > 0;

  return (
    <PageContainer>
      <PageHeader
        title="Loyalty program"
        description={
          program.description ||
          "How customers earn and burn value. Changes apply to future transactions — ledger history is never rewritten."
        }
        meta={
          <>
            <StatusBadge status={program.status} />
            <Badge variant="secondary">
              {program.type === "POINTS" ? "Points" : "Stamps"}
            </Badge>
            <Badge variant="outline">Rules version {program.ruleVersion}</Badge>
            <span className="text-muted-foreground text-sm">
              {rewards.length} reward{rewards.length === 1 ? "" : "s"}
            </span>
            {canWrite ? null : (
              <Badge variant="outline">Read-only for your role</Badge>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Program rules</CardTitle>
            <CardDescription>
              {canWrite
                ? "Saving keeps the program a draft until you activate it in the wizard; the server re-validates every value and bumps the rule version when the rules actually change."
                : "Managers can review these rules — only the owner can change them."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProgramForm
              defaultValues={programFormValues({
                type: program.type,
                name: program.name,
                description: program.description,
                unitName: program.unitName,
                configuration: program.configuration,
              })}
              typeLocked={typeLocked}
              disabled={!canWrite}
            />
          </CardContent>
        </Card>

        <aside className="flex flex-col gap-4">
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
        </aside>
      </div>
    </PageContainer>
  );
}
