import type { Metadata } from "next";
import { ReceiptIcon, ZapIcon } from "lucide-react";

import { requirePageAccess } from "@/auth/guard";
import { getDb } from "@/db/connection";
import { MerchantEntity } from "@/db/entities/merchant.entity";
import { summarizeProgram } from "@/features/loyalty/schemas";
import { findProgram } from "@/features/loyalty/service";
import {
  listMemberOptions,
  listTenantTransactions,
  TRANSACTION_GROUP_LABELS,
} from "@/features/loyalty/transactions";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { EmptyState } from "@/components/patterns/states";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { PurchaseRegister } from "./purchase-register";

export const metadata: Metadata = {
  title: "Register",
};

/**
 * Purchase entry at the register (checklist §8 bullets 5–6).
 *
 * Everything on this page comes from the database: the member picker, the
 * active program's rules, and the latest ledger entries. The award itself is
 * never rendered here — the client shows what the server's preview returned,
 * and only the confirmed submission writes.
 */
export default async function RegisterPage() {
  const auth = await requirePageAccess([
    "transactions.read",
    "transactions.create",
  ]);

  if (!auth.merchantId) {
    return (
      <PageContainer>
        <PageHeader
          title="Register"
          description="Record a purchase and award value in one step."
        />
        <EmptyState
          title="No active workspace"
          description="The register belongs to a business workspace. Pick the workspace you're working in to record transactions."
        />
      </PageContainer>
    );
  }

  const db = await getDb();
  const [merchant, program, memberOptions, recent] = await Promise.all([
    db.getRepository(MerchantEntity).findOneBy({ id: auth.merchantId }),
    findProgram(db.manager, auth.merchantId),
    listMemberOptions(auth),
    listTenantTransactions(auth, { limit: 5 }),
  ]);

  const unitName =
    program?.unitName ?? (program?.type === "STAMPS" ? "stamps" : "points");
  const bullets =
    program && merchant
      ? summarizeProgram({
          type: program.type,
          unitName: program.unitName,
          configuration: program.configuration,
          currency: merchant.currency,
        })
      : [];

  return (
    <PageContainer>
      <PageHeader
        title="Register"
        description="Identify the member, enter the purchase, review the server's calculation, then confirm. The balance updates exactly once."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <PurchaseRegister memberOptions={memberOptions} unitName={unitName} />
        </div>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ZapIcon aria-hidden="true" className="size-4" />
                Earning rules
              </CardTitle>
              <CardDescription>
                {program
                  ? `${program.name} · rules v${program.ruleVersion}`
                  : "No active program yet."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {bullets.length > 0 ? (
                bullets.map((bullet) => (
                  <p key={bullet} className="text-muted-foreground">
                    {bullet}
                  </p>
                ))
              ) : (
                <p className="text-muted-foreground">
                  Set up a loyalty program before recording purchases — the
                  server refuses to award anything without active rules.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ReceiptIcon aria-hidden="true" className="size-4" />
                Latest entries
              </CardTitle>
              <CardDescription>Most recent ledger activity.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              {recent.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nothing recorded yet — confirmed purchases appear here.
                </p>
              ) : (
                recent.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {entry.customerName}
                    </span>
                    <StatusBadge
                      status={entry.group}
                      label={TRANSACTION_GROUP_LABELS[entry.group]}
                    />
                    <span
                      className={`shrink-0 tabular-nums ${
                        entry.delta < 0 ? "text-destructive" : ""
                      }`}
                    >
                      {entry.amountLabel}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
