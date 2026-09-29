import Link from "next/link";
import {
  ArrowRightIcon,
  BarChart3Icon,
  CoffeeIcon,
  GiftIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  UsersIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const ROLES = [
  {
    icon: ShieldCheckIcon,
    title: "Platform administrators",
    href: "/admin",
    items: [
      "Merchant and user management",
      "Platform analytics",
      "System settings",
    ],
  },
  {
    icon: ShoppingBagIcon,
    title: "Merchant owners & managers",
    href: "/dashboard",
    items: [
      "Operations dashboard",
      "Loyalty program configuration",
      "Customers, rewards, campaigns",
    ],
  },
  {
    icon: CoffeeIcon,
    title: "Staff at the counter",
    href: "/register",
    items: [
      "Find a customer in seconds",
      "Record purchases",
      "Verify and redeem rewards",
    ],
  },
  {
    icon: UsersIcon,
    title: "Customers",
    href: "/me",
    items: [
      "Points balance and tier",
      "Available rewards",
      "Activity, offers and profile",
    ],
  },
];

export default function LandingPage() {
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="border-border border-b">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg"
            >
              <CoffeeIcon className="size-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Loyalty
            </span>
            <span className="text-muted-foreground hidden text-sm sm:inline">
              Multi-tenant platform
            </span>
          </span>
          <nav aria-label="Account" className="flex items-center gap-2">
            <Button variant="ghost" render={<Link href="/sign-in" />}>
              Sign in
            </Button>
            <Button render={<Link href="/preview" />}>
              Open demo
              <ArrowRightIcon />
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6">
        <section className="flex flex-col items-start gap-6 py-16 sm:py-24">
          <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
            Loyalty operations, per role
          </p>
          <h1 className="font-heading max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            One platform, four consoles, exactly the access each one needs.
          </h1>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed">
            Run points programs from the platform dashboard, configure the
            program as a merchant, ring up purchases at the counter, and let
            customers track their rewards — each behind its own server-side
            guard.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" render={<Link href="/preview" />}>
              Explore the demo workspaces
              <ArrowRightIcon />
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<Link href="/sign-in" />}
            >
              Sign-in status
            </Button>
          </div>
        </section>

        <section
          aria-labelledby="roles-heading"
          className="border-border border-t py-14"
        >
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h2
                id="roles-heading"
                className="font-heading text-xl font-semibold tracking-tight"
              >
                A workspace for every role
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Navigation, pages and permissions switch with the role.
              </p>
            </div>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((role) => (
              <li key={role.title}>
                <Link
                  href="/preview"
                  className="border-border hover:bg-muted/50 group focus-visible:ring-ring/50 flex h-full flex-col gap-3 rounded-xl border p-4 transition-colors focus-visible:ring-3 focus-visible:outline-none"
                >
                  <span
                    aria-hidden="true"
                    className="bg-muted flex size-8 items-center justify-center rounded-lg"
                  >
                    <role.icon className="text-foreground size-4" />
                  </span>
                  <span className="text-sm leading-snug font-medium">
                    {role.title}
                  </span>
                  <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
                    {role.items.map((item) => (
                      <li key={item} className="flex gap-1.5">
                        <span aria-hidden="true">·</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-medium">
                    Preview
                    <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="access-heading"
          className="border-border border-t py-14"
        >
          <h2
            id="access-heading"
            className="font-heading mb-6 text-xl font-semibold tracking-tight"
          >
            Access is enforced on the server
          </h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            <li className="border-border rounded-xl border p-4">
              <ShieldCheckIcon
                aria-hidden="true"
                className="text-muted-foreground mb-2 size-4"
              />
              <p className="text-sm font-medium">Guarded routes and APIs</p>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                Pages, layouts and every API call resolve the caller
                independently — hiding a link is never the protection.
              </p>
            </li>
            <li className="border-border rounded-xl border p-4">
              <GiftIcon
                aria-hidden="true"
                className="text-muted-foreground mb-2 size-4"
              />
              <p className="text-sm font-medium">
                Confirmed, explained actions
              </p>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                Destructive or value-affecting operations ask first, then report
                exactly what changed — or that nothing did.
              </p>
            </li>
            <li className="border-border rounded-xl border p-4">
              <BarChart3Icon
                aria-hidden="true"
                className="text-muted-foreground mb-2 size-4"
              />
              <p className="text-sm font-medium">Consistent operational UI</p>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                Shared shells, tables, forms, dialogs and loading, empty and
                error states across every console.
              </p>
            </li>
          </ul>
        </section>
      </main>

      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Demo workspace with session-local sample data — the database lands
            in checklist §4.
          </p>
          <p className="font-mono">
            Checklist §3 · Product design and navigation
          </p>
        </div>
      </footer>
    </div>
  );
}
