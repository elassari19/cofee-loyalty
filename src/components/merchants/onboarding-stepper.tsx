import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { cn } from "cn";

import { Progress } from "@/components/ui/progress";

import type { OnboardingStep } from "@/features/merchants/onboarding";

/**
 * Onboarding progress (checklist §6 bullet 8).
 *
 * Progress is rendered from server-derived step state — completed steps link
 * back for edits, the current step is marked, and the bar shows the ratio so
 * a resuming merchant instantly sees where they left off.
 */
export function OnboardingStepper({
  steps,
  current,
}: {
  steps: OnboardingStep[];
  /** Step id of the page being viewed, if any. */
  current?: OnboardingStep["id"];
}) {
  const done = steps.filter((step) => step.complete).length;

  return (
    <nav aria-label="Onboarding progress" className="flex flex-col gap-3">
      <Progress
        value={(done / steps.length) * 100}
        aria-label={`${done} of ${steps.length} steps complete`}
      />
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => {
          const isCurrent = step.id === current;
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  step.complete
                    ? "border-primary bg-primary text-primary-foreground"
                    : isCurrent
                      ? "border-primary text-primary"
                      : "text-muted-foreground",
                )}
              >
                {step.complete ? <CheckIcon className="size-3.5" /> : index + 1}
              </span>
              <span className="min-w-0 flex-1 flex-col">
                <span
                  className={cn(
                    "truncate text-sm font-medium",
                    isCurrent && "text-primary",
                  )}
                >
                  {step.title}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {step.complete
                    ? "Done"
                    : isCurrent
                      ? "In progress"
                      : "Pending"}
                </span>
              </span>
            </>
          );

          return (
            <li key={step.id}>
              {isCurrent ? (
                <div
                  aria-current="step"
                  className="border-primary/40 bg-primary/5 flex items-center gap-2.5 rounded-lg border px-3 py-2"
                >
                  {content}
                </div>
              ) : (
                <Link
                  href={step.href}
                  className="hover:bg-accent flex items-center gap-2.5 rounded-lg border px-3 py-2"
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
