import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

type Variant = VariantProps<typeof badgeVariants>["variant"];

/**
 * Monochrome status pill used by every table (checklist §3 bullet 4):
 * hierarchy comes from emphasis, not from a rainbow of status colours.
 *   - positive/running states  → `secondary`
 *   - transitional states      → `outline`
 *   - terminal/negative states → `destructive`
 *   - highlighted states       → `default`
 */
const STATUS_VARIANT: Record<string, Variant> = {
  active: "secondary",
  live: "default",
  Gold: "default",
  trial: "outline",
  invited: "outline",
  scheduled: "secondary",
  draft: "outline",
  ended: "outline",
  dormant: "outline",
  Bronze: "outline",
  Silver: "secondary",
  suspended: "destructive",
  disabled: "destructive",
  earn: "secondary",
  redeem: "default",
  adjustment: "outline",
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "outline"} className={className}>
      {label ?? status}
    </Badge>
  );
}
