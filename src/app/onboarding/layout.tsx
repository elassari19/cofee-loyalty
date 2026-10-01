import Link from "next/link";
import type { Metadata } from "next";

import { homePathFor } from "@/auth/context";
import { PageContainer } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";

import { guardOnboarding } from "./onboarding-context";

export const metadata: Metadata = {
  title: { template: "%s · Merchant setup", default: "Merchant setup" },
};

/**
 * Minimal chrome for the wizard (checklist §6 bullet 8): no dashboard shell,
 * so nothing tempts a merchant to leave mid-setup. The exit button always
 * leads to the role's home route — progress is already stored with the
 * business, so leaving never loses work.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await guardOnboarding();

  return (
    <PageContainer>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex min-w-0 flex-col">
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Merchant setup
          </span>
          <span className="truncate text-sm font-medium">
            {auth.displayName}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={homePathFor(auth)} />}
        >
          Save &amp; exit
        </Button>
      </div>
      {children}
    </PageContainer>
  );
}
