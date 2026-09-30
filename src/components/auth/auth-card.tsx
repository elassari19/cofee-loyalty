import Link from "next/link";
import type { ComponentType } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Centered shell for the unauthenticated pages (checklist §5).
 *
 * One layout for sign-in, sign-up, password reset and email verification keeps
 * the sequence visually consistent and leaves every page free to render its
 * own form and notices inside `<CardContent>`.
 */
export function AuthCard({
  icon: Icon,
  title,
  description,
  children,
  footnote,
}: {
  icon: ComponentType<{
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Small print under the card; defaults to a link back to the overview. */
  footnote?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon aria-hidden="true" className="size-5" />
            {title}
          </CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>

      <p className="text-muted-foreground text-center text-xs">
        {footnote ?? (
          <Link
            href="/"
            className="hover:text-foreground underline underline-offset-4"
          >
            Back to overview
          </Link>
        )}
      </p>
    </div>
  );
}
