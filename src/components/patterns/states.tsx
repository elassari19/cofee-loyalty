import type { LucideIcon } from "lucide-react";
import { CircleAlertIcon, InboxIcon, RefreshCcwIcon } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared loading, empty and error states (checklist §3 bullet 2).
 * Every list, dashboard and table in the app renders one of these instead of
 * a blank rectangle.
 */

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  /** Optional call to action (create/import/…). */
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <Empty className={cn("border", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action}
    </Empty>
  );
}

interface ErrorStateProps {
  title?: string;
  description?: string;
  /** Wired to a `reset()` from an `error.tsx` boundary. */
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this view. Your data is untouched — try again in a moment.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <Empty
      role="alert"
      className={cn("border-destructive/30 border", className)}
    >
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="bg-destructive/10 text-destructive"
        >
          <CircleAlertIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCcwIcon />
          Try again
        </Button>
      ) : null}
    </Empty>
  );
}

/** Route-level `loading.tsx` fallback: header + card grid skeletons. */
export function PageSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading page"
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 sm:p-6"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

/** Inline skeleton for a single card or panel. */
export function PanelSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton aria-busy="true" className={cn("h-32 rounded-xl", className)} />
  );
}
