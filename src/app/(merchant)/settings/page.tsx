import Link from "next/link";
import type { Metadata } from "next";
import { Building2Icon } from "lucide-react";

import { can, requirePageAccess } from "@/auth/guard";
import { MerchantEntity } from "@/db/entities/merchant.entity";
import { getDb } from "@/db/connection";
import { businessProfileValues } from "@/features/merchants/schemas";
import { BusinessForm } from "@/components/merchants/business-form";
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
  title: "Business settings",
};

/**
 * Business settings (checklist §6 bullet 1 — the edit half of the profile).
 *
 * The row shown is the *active tenant* resolved from the session, and the
 * form saves through the same onboarding action, which re-derives that target
 * server-side — so what you read and what you write are always the same
 * business. `slug` and `status` never appear in the form; ownership of those
 * stays with the server.
 */
export default async function SettingsPage() {
  const auth = await requirePageAccess("merchant.read");
  const canWrite = can(auth, "merchant.write");
  const db = await getDb();
  const merchant = auth.merchantId
    ? await db.getRepository(MerchantEntity).findOneBy({ id: auth.merchantId })
    : null;

  if (!merchant) {
    return (
      <PageContainer>
        <PageHeader
          title="Business settings"
          description="Profile, contact details and receipt behaviour for this store."
        />
        <EmptyState
          icon={Building2Icon}
          title="No active workspace"
          description="Settings belong to a business workspace. Pick the workspace you're working in — preview contexts and accounts without an active membership land here too."
          action={
            <Button render={<Link href="/choose-merchant" />}>
              Choose a workspace
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Business settings"
        description="Identity, contact details and receipt behaviour for this store."
        meta={
          <>
            <StatusBadge status={merchant.status} />
            <span className="text-muted-foreground text-sm">
              {merchant.name} · /join/{merchant.slug}
            </span>
            {canWrite ? (
              <Badge variant="secondary">You can change these settings</Badge>
            ) : (
              <Badge variant="outline">Owner-only · read-only for you</Badge>
            )}
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Store profile</CardTitle>
          <CardDescription>
            {canWrite
              ? "Saving is confirmed on the server; failures report that nothing changed. The public join link never changes after registration."
              : "Managers can view these settings — only the owner can change them."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessForm
            mode="edit"
            defaultValues={businessProfileValues(merchant)}
            disabled={!canWrite}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
