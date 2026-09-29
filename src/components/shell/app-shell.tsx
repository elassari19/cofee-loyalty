import { cn } from "cn";

import type { AuthContext } from "@/auth/context";
import { roleLabel } from "@/auth/roles";
import { Badge } from "@/components/ui/badge";

import { brandForRole } from "./nav-config";
import { MobileNav } from "./mobile-nav";
import { PathLabel } from "./path-label";
import { SideNav } from "./side-nav";
import { UserMenu } from "./user-menu";

/**
 * Responsive application shell (checklist §3 bullet 2).
 *
 * Server component that composes the client-side navigation pieces. Every
 * audience — platform, merchant, staff, customer — renders this same shell
 * with its own navigation set, so accessibility behaviour (skip link, focus
 * order, `aria-current`, labelled controls) is identical everywhere.
 */
export function AppShell({
  auth,
  children,
}: {
  auth: AuthContext;
  children: React.ReactNode;
}) {
  const brand = brandForRole(auth.role);
  const BrandIcon = brand.icon;

  return (
    <div className="bg-background flex min-h-svh">
      <a
        href="#main-content"
        className={cn(
          "border-border bg-background focus:ring-ring/50 sr-only fixed top-2 left-2 z-50 rounded-lg border px-3 py-2 text-sm shadow-md",
          "focus:not-sr-only focus:ring-3",
        )}
      >
        Skip to content
      </a>

      <aside className="border-border bg-muted/20 hidden w-60 shrink-0 flex-col border-r md:flex">
        <div className="border-border flex h-14 items-center gap-2.5 border-b px-4">
          <span
            aria-hidden="true"
            className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-lg"
          >
            <BrandIcon className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm leading-tight font-semibold">
              {brand.name}
            </span>
            <span className="text-muted-foreground block truncate text-xs leading-tight">
              {brand.context}
            </span>
          </span>
        </div>

        <SideNav role={auth.role} className="flex-1 overflow-y-auto p-3" />

        <div className="border-border flex items-center gap-2 border-t px-4 py-3">
          <Badge variant="outline">{roleLabel(auth.role)}</Badge>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-background/95 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur sm:px-4">
          <MobileNav role={auth.role} />
          <span className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-lg md:hidden">
            <BrandIcon aria-hidden="true" className="size-4" />
          </span>
          <PathLabel role={auth.role} className="min-w-0 flex-1" />
          <UserMenu auth={auth} />
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
