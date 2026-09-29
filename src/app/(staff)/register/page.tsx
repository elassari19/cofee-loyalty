import type { Metadata } from "next";
import { ReceiptIcon, ZapIcon } from "lucide-react";

import { requirePageAccess } from "@/auth/guard";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getLoyalty, listCustomers, listTransactions } from "@/lib/demo-store";
import { formatNumber, formatSignedPoints } from "@/lib/format";

import { PurchaseForm } from "./purchase-form";

export const metadata: Metadata = {
  title: "Register",
};

export default async function RegisterPage() {
  await requirePageAccess("transactions.create");
  const loyalty = getLoyalty();
  const recent = listTransactions().slice(0, 5);

  return (
    <PageContainer>
      <PageHeader
        title="Register"
        description="Record a purchase and award points in one step. The server recalculates the award from the active program rules."
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptIcon aria-hidden="true" className="size-4" />
              Record a purchase
            </CardTitle>
            <CardDescription>
              Find the customer, enter the amount, and the points post
              immediately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PurchaseForm
              customers={listCustomers().map((customer) => ({
                id: customer.id,
                name: customer.name,
              }))}
              earnRate={loyalty.earnRate}
              minPurchase={loyalty.minPurchase}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ZapIcon aria-hidden="true" className="size-4" />
                Earning rules
              </CardTitle>
              <CardDescription>Active program configuration.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Points per $1</span>
                <span className="font-medium tabular-nums">
                  {formatNumber(loyalty.earnRate)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Minimum purchase</span>
                <span className="font-medium tabular-nums">
                  ${formatNumber(loyalty.minPurchase)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Program</span>
                <span className="font-medium">{loyalty.programName}</span>
              </div>
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
              {recent.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {transaction.customerName}
                  </span>
                  <StatusBadge
                    status={transaction.type}
                    label={
                      transaction.type === "earn"
                        ? "Earn"
                        : transaction.type === "redeem"
                          ? "Redeem"
                          : "Adjust"
                    }
                  />
                  <span
                    className={`shrink-0 tabular-nums ${
                      transaction.points < 0 ? "text-destructive" : ""
                    }`}
                  >
                    {formatSignedPoints(transaction.points)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
