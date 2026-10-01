import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRightIcon, GiftIcon, StoreIcon } from "lucide-react";

import {
  MERCHANT_CATEGORY_LABELS,
  type MerchantCategory,
  emptyBusinessProfileValues,
} from "@/features/merchants/schemas";
import { summarizeProgram } from "@/features/loyalty/schemas";
import { OnboardingStepper } from "@/components/merchants/onboarding-stepper";
import { BusinessForm } from "@/components/merchants/business-form";
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

import { requireOnboarding } from "./onboarding-context";

export const metadata: Metadata = {
  title: "Set up your business",
};

/**
 * Wizard hub (checklist §6 bullet 8).
 *
 * An identity that owns nothing gets the registration form; an identity with
 * a business gets its progress picture. Everything here comes from the
 * database, so the same links appear no matter which device resumes the flow.
 */
export default async function OnboardingHubPage() {
  const { state } = await requireOnboarding();

  if (!state) {
    return (
      <>
        <PageHeader
          title="Register your business"
          description="Create your store's profile — the first step of your loyalty program. Progress is saved as you go, so you can finish later."
        />
        <Card>
          <CardHeader>
            <CardTitle>Business details</CardTitle>
            <CardDescription>
              Customers see your name, category and address on the join page;
              the receipt and portal reuse the same details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BusinessForm
              mode="create"
              defaultValues={emptyBusinessProfileValues()}
            />
          </CardContent>
        </Card>
      </>
    );
  }

  const { merchant, program, rewards, steps, nextStep, complete } = state;
  const categoryLabel =
    MERCHANT_CATEGORY_LABELS[merchant.category as MerchantCategory] ??
    merchant.category ??
    "Uncategorised";

  return (
    <>
      <PageHeader
        title={complete ? `${merchant.name} is live` : "Set up your business"}
        description={
          complete
            ? "Your program is active. Display the join QR so customers can enroll."
            : "Four steps — profile, program, reward, launch. Your position is stored with the business, so stopping never loses progress."
        }
        meta={<StatusBadge status={merchant.status} />}
        actions={
          complete ? (
            <Button render={<Link href="/onboarding/launch" />}>
              View join QR
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          ) : nextStep ? (
            <Button render={<Link href={nextStep.href} />}>
              Resume — {nextStep.title}
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          ) : null
        }
      />

      <OnboardingStepper steps={steps} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <StoreIcon aria-hidden="true" className="size-4" />
              {merchant.name}
            </CardTitle>
            <CardDescription>
              {categoryLabel} · join link{" "}
              <Link
                href={`/join/${merchant.slug}`}
                className="hover:text-foreground underline underline-offset-4"
              >
                /join/{merchant.slug}
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{merchant.currency}</Badge>
            <Badge variant="outline">{merchant.timezone}</Badge>
            {merchant.email ? (
              <Badge variant="secondary">{merchant.email}</Badge>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GiftIcon aria-hidden="true" className="size-4" />
              {program ? program.name : "Loyalty program"}
            </CardTitle>
            <CardDescription>
              {program
                ? `${rewards.length} reward${rewards.length === 1 ? "" : "s"} ready`
                : "Not configured yet — pick points or stamps in the next step."}
            </CardDescription>
          </CardHeader>
          {program ? (
            <CardContent className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {program.type === "POINTS" ? "Points" : "Stamps"}
                </Badge>
                <StatusBadge status={program.status} />
              </div>
              <ul className="text-muted-foreground list-disc space-y-0.5 pl-5 text-sm">
                {summarizeProgram({
                  type: program.type,
                  unitName: program.unitName,
                  configuration: program.configuration,
                  currency: merchant.currency,
                })
                  .slice(0, 3)
                  .map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
              </ul>
            </CardContent>
          ) : null}
        </Card>
      </div>
    </>
  );
}
