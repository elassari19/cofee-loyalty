import type { Metadata } from "next";
import {
  CircleCheckIcon,
  CoinsIcon,
  KeyRoundIcon,
  TimerIcon,
} from "lucide-react";

import { requirePageAccess } from "@/auth/guard";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listMerchants } from "@/lib/demo-store";

export const metadata: Metadata = {
  title: "Platform settings",
};

const DEFAULTS = [
  {
    icon: CoinsIcon,
    label: "Default currency",
    value: "USD",
    note: "Applied to new merchants at signup; each tenant can choose its own.",
  },
  {
    icon: TimerIcon,
    label: "Trial length",
    value: "14 days",
    note: "Full feature access, then the merchant picks a plan.",
  },
  {
    icon: KeyRoundIcon,
    label: "Authentication",
    value: "Better Auth (§5)",
    note: "Sessions, password reset and verification land with checklist §5.",
  },
  {
    icon: CircleCheckIcon,
    label: "Data layer",
    value: "Demo workspace (§4)",
    note: "PostgreSQL + TypeORM entities replace the sample data in §4.",
  },
];

export default async function PlatformSettingsPage() {
  await requirePageAccess("platform.manage");
  const merchants = listMerchants();
  const suspended = merchants.filter((m) => m.status === "suspended").length;

  return (
    <PageContainer>
      <PageHeader
        title="Platform settings"
        description="Platform-wide defaults and the current state of the stack."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {DEFAULTS.map((item) => (
          <Card key={item.label}>
            <CardHeader className="flex flex-row items-start gap-3">
              <span
                aria-hidden="true"
                className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg"
              >
                <item.icon className="text-muted-foreground size-4" />
              </span>
              <div>
                <CardTitle className="text-sm">{item.label}</CardTitle>
                <CardDescription>{item.note}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold tracking-tight">
                {item.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenant health</CardTitle>
          <CardDescription>
            Current distribution of merchant statuses across the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {merchants.filter((m) => m.status === "active").length} active
          </Badge>
          <Badge variant="outline">
            {merchants.filter((m) => m.status === "trial").length} in trial
          </Badge>
          <Badge variant="destructive">{suspended} suspended</Badge>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
