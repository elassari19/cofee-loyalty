import type { LucideIcon } from "lucide-react";
import { cn } from "cn";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface MetricCardProps {
  label: string;
  /** Pass `null` while the metric has no source yet — renders an em dash. */
  value: React.ReactNode;
  /** Small qualifier: time window, comparison, unit. */
  hint?: string;
  icon?: LucideIcon;
  loading?: boolean;
  className?: string;
}

/** Dashboard/analytics metric tile with an explicit loading state. */
export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  loading = false,
  className,
}: MetricCardProps) {
  return (
    <Card className={cn("gap-2 py-4", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-4">
        <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </CardTitle>
        {Icon ? (
          <Icon aria-hidden="true" className="text-muted-foreground size-4" />
        ) : null}
      </CardHeader>
      <CardContent className="px-4">
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-semibold tracking-tight tabular-nums">
            {value ?? "—"}
          </div>
        )}
        {hint ? (
          <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
