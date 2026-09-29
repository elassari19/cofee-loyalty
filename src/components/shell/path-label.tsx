"use client";

import { usePathname } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "cn";

import type { Role } from "@/auth/roles";

import { brandForRole, navItemForPath } from "./nav-config";

/**
 * Header breadcrumb for the current route: `Section / Page`, derived from the
 * same navigation config the sidebar uses so labels never disagree.
 */
export function PathLabel({
  role,
  className,
}: {
  role: Role;
  className?: string;
}) {
  const pathname = usePathname();
  const resolved = navItemForPath(role, pathname);
  const brand = brandForRole(role);

  return (
    <p
      aria-label="Current page"
      className={cn("flex min-w-0 items-center gap-1.5 text-sm", className)}
    >
      <span className="text-muted-foreground hidden truncate sm:inline">
        {resolved?.section ?? brand.name}
      </span>
      {resolved?.section ? (
        <ChevronRightIcon
          aria-hidden="true"
          className="text-muted-foreground hidden size-3.5 shrink-0 sm:block"
        />
      ) : null}
      <span className="truncate font-medium">
        {resolved?.item.label ?? brand.context}
      </span>
    </p>
  );
}
