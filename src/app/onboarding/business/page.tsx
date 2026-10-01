import type { Metadata } from "next";

import { businessProfileValues } from "@/features/merchants/schemas";
import { STEP_COPY } from "@/features/merchants/onboarding";
import { OnboardingStepper } from "@/components/merchants/onboarding-stepper";
import { BusinessForm } from "@/components/merchants/business-form";
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
  title: "Business profile",
};

/**
 * Wizard step 1 — business profile (checklist §6 bullet 1).
 *
 * The form runs in `edit` mode: registration created the row, and this step
 * completes it (contact, address, currency, timezone) until the profile
 * passes the same completeness check the progress tracker uses. Saving
 * advances one round trip via the `nextPath` the action returns.
 */
export default async function OnboardingBusinessPage() {
  const { state } = await requireStep("business");
  const { merchant, steps } = state;

  return (
    <>
      <PageHeader
        title="Business profile"
        description={STEP_COPY.business.description}
        meta={
          <>
            <StatusBadge status={merchant.status} />
            <span className="text-muted-foreground text-sm">
              {merchant.name}
            </span>
          </>
        }
      />

      <OnboardingStepper steps={steps} current="business" />

      <Card>
        <CardHeader>
          <CardTitle>Profile details</CardTitle>
          <CardDescription>
            A name, category, contact email, address, currency and timezone
            complete this step — phone, website, logo and description are
            optional.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessForm
            mode="edit"
            defaultValues={businessProfileValues(merchant)}
            advance
          />
        </CardContent>
      </Card>
    </>
  );
}
