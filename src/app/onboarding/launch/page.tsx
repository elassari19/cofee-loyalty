import Link from "next/link";
import type { Metadata } from "next";
import { GiftIcon, RocketIcon, StoreIcon } from "lucide-react";
import QRCode from "qrcode";

import { STEP_COPY } from "@/features/merchants/onboarding";
import { joinUrlFor } from "@/features/merchants/join";
import { ActivateButton } from "@/components/loyalty/activate-button";
import { ProgramPreview } from "@/components/loyalty/program-preview";
import { JoinQrCard } from "@/components/merchants/join-qr-card";
import { OnboardingStepper } from "@/components/merchants/onboarding-stepper";
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
  title: "Activate & join QR",
};

/**
 * Wizard step 4 — launch (checklist §6 bullets 5 and 7).
 *
 * Until activation the page is a final review with the owner-only activate
 * button; after it, the same route renders the join QR. The QR payload is
 * built from the public slug alone (`/join/<slug>`), encoded once on the
 * server from exactly the URL the copy button shows — no email, phone or
 * customer data ever enters the image.
 */
export default async function OnboardingLaunchPage() {
  const { state } = await requireStep("launch");
  const { merchant, program, rewards, steps, complete } = state;
  const joinUrl = joinUrlFor(merchant.slug);

  const preview = program ? (
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
  ) : null;

  const rewardsCard = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GiftIcon aria-hidden="true" className="size-4" />
          Rewards
        </CardTitle>
        <CardDescription>
          {rewards.length} reward{rewards.length === 1 ? "" : "s"} customers can
          redeem.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {rewards.map((reward) => (
          <Badge key={reward.id} variant="secondary">
            {reward.name} · {reward.cost}{" "}
            {program?.unitName ??
              (program?.type === "STAMPS" ? "stamps" : "points")}
          </Badge>
        ))}
      </CardContent>
    </Card>
  );

  if (!complete || !program) {
    return (
      <>
        <PageHeader
          title="Activate & join QR"
          description={STEP_COPY.launch.description}
          meta={<StatusBadge status={merchant.status} />}
        />

        <OnboardingStepper steps={steps} current="launch" />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <StoreIcon aria-hidden="true" className="size-4" />
                  {merchant.name}
                </CardTitle>
                <CardDescription>
                  Profile, program and reward are ready — activation starts
                  accepting customers in the same transaction.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Badge variant="outline">{merchant.currency}</Badge>
                <Badge variant="outline">{merchant.timezone}</Badge>
                <Badge variant="secondary">/join/{merchant.slug}</Badge>
              </CardContent>
            </Card>
            {preview}
            {rewardsCard}
          </div>

          <aside>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RocketIcon aria-hidden="true" className="size-4" />
                  Ready to launch?
                </CardTitle>
                <CardDescription>
                  Activating flips the program to live and the business out of
                  trial in one step, then reveals the join QR below. Rules you
                  save afterwards still apply only to future transactions.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ActivateButton />
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Only the business owner can activate — that is you, because
                  you registered this business.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </>
    );
  }

  const qrDataUrl = await QRCode.toDataURL(joinUrl, {
    margin: 1,
    width: 352,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });

  return (
    <>
      <PageHeader
        title={`${merchant.name} is live`}
        description="Your program is active. Display the join QR at the counter — scanning it opens the join page with your public slug, nothing else."
        meta={
          <>
            <StatusBadge status={merchant.status} />
            <StatusBadge status={program.status} label="Program active" />
          </>
        }
        actions={
          <Button render={<Link href="/dashboard" />}>Go to dashboard</Button>
        }
      />

      <OnboardingStepper steps={steps} current="launch" />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {preview}
          {rewardsCard}
        </div>

        <aside>
          <JoinQrCard
            businessName={merchant.name}
            joinUrl={joinUrl}
            qrDataUrl={qrDataUrl}
          />
        </aside>
      </div>
    </>
  );
}
