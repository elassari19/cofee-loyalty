import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  BarChart3Icon,
  CheckIcon,
  CoffeeIcon,
  CoinsIcon,
  DumbbellIcon,
  FileTextIcon,
  GiftIcon,
  KeyRoundIcon,
  LockIcon,
  QrCodeIcon,
  ScissorsIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  StarIcon,
  StoreIcon,
  UsersIcon,
  UtensilsCrossedIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Cofe — Turn one-time visitors into regulars",
  description:
    "Points and stamp-card loyalty for cafes, restaurants, salons, gyms and local retail. QR join in seconds, counter register for staff, rewards customers love — with server-side tenant isolation.",
};

const CATEGORIES = [
  { icon: CoffeeIcon, label: "Cafés & coffee shops" },
  { icon: UtensilsCrossedIcon, label: "Restaurants" },
  { icon: ScissorsIcon, label: "Salons & barbers" },
  { icon: DumbbellIcon, label: "Gyms & studios" },
  { icon: StoreIcon, label: "Local retail" },
];

const STEPS = [
  {
    n: "01",
    icon: QrCodeIcon,
    title: "Customer scans, joins in seconds",
    body: "Each merchant gets a join URL and QR code with no personal data in the payload. The customer signs up once and receives an opaque, revocable loyalty identity.",
    cta: { label: "How joining works", href: "/preview" },
  },
  {
    n: "02",
    icon: CoinsIcon,
    title: "Staff ring up, points land",
    body: "The cashier scans the member QR, enters €23.50, and the server calculates 23 points from your rules. Ledger write and balance update are atomic — exactly once.",
    cta: { label: "See the register", href: "/register" },
  },
  {
    n: "03",
    icon: GiftIcon,
    title: "Rewards redeem once, verified",
    body: "Customers request a reward, get a short-lived opaque code, and staff verify then redeem. Double-spend, expired and cross-tenant codes are rejected.",
    cta: { label: "See rewards", href: "/me/rewards" },
  },
];

const ROLES = [
  {
    icon: ShieldCheckIcon,
    title: "Platform administrators",
    href: "/admin",
    blurb: "Run the whole SaaS from /admin.",
    items: [
      "Merchant and user management",
      "Platform analytics",
      "Activate / suspend with audit trail",
    ],
  },
  {
    icon: ShoppingBagIcon,
    title: "Merchant owners & managers",
    href: "/dashboard",
    blurb: "Configure and grow from /dashboard.",
    items: [
      "Points or stamp-card setup",
      "Customers, rewards, campaigns",
      "Tenant-scoped analytics",
    ],
  },
  {
    icon: CoffeeIcon,
    title: "Staff at the counter",
    href: "/register",
    blurb: "Fast flows at /register.",
    items: [
      "Find a customer in seconds",
      "Record purchases with confirm step",
      "Verify and redeem rewards",
    ],
  },
  {
    icon: UsersIcon,
    title: "Customers",
    href: "/me",
    blurb: "Balances and rewards at /me.",
    items: [
      "Points balance and progress",
      "Available rewards and offers",
      "Activity history and profile",
    ],
  },
];

const PLANS = [
  {
    name: "Free",
    price: "€0",
    per: "to start",
    blurb: "One program, first regulars.",
    features: [
      "1 loyalty program",
      "Up to 100 members",
      "1 staff seat",
      "QR join + member card",
    ],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Starter",
    price: "€19",
    per: "/mo sample",
    blurb: "For the corner shop filling seats.",
    features: [
      "Up to 500 members",
      "3 staff seats",
      "Rewards + redemptions",
      "Basic analytics",
    ],
    cta: "Start onboarding",
    featured: false,
  },
  {
    name: "Pro",
    price: "€49",
    per: "/mo sample",
    blurb: "For rooms that run on repeat visits.",
    features: [
      "Up to 2,500 members",
      "Unlimited staff",
      "Campaigns + participation",
      "Full analytics",
    ],
    cta: "Choose Pro",
    featured: true,
  },
  {
    name: "Business",
    price: "€99",
    per: "/mo sample",
    blurb: "For small chains and busy floors.",
    features: [
      "Unlimited members",
      "Priority support",
      "Exports with limits",
      "Audit log access",
    ],
    cta: "Talk to us",
    featured: false,
  },
];

const TRUST = [
  {
    icon: ShieldCheckIcon,
    title: "Tenant isolation by default",
    body: "Every customer, transaction, reward and campaign carries a merchant_id. Server guards scope each query — Merchant A can never reach Merchant B.",
  },
  {
    icon: LockIcon,
    title: "Guards, not hidden links",
    body: "Pages, layouts and every API route resolve the caller independently. Hiding navigation is never the protection.",
  },
  {
    icon: KeyRoundIcon,
    title: "Opaque loyalty identity",
    body: "QR payloads carry revocable tokens, never names, emails or balances. Lookup happens server-side after staff authentication.",
  },
  {
    icon: FileTextIcon,
    title: "Immutable ledger + audit",
    body: "Points and stamps are append-only entries with actor, reason and rule version. Corrections are reversing entries — history stays auditable.",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <a
        href="#main-content"
        className="focus:bg-primary focus:text-primary-foreground sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>

      <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            aria-label="Cofe home"
            className="focus-visible:ring-ring/50 flex items-center gap-2.5 rounded-lg focus-visible:ring-3 focus-visible:outline-none"
          >
            <span
              aria-hidden="true"
              className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg"
            >
              <CoffeeIcon className="size-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Cofe</span>
            <span className="text-muted-foreground hidden text-sm sm:inline">
              Loyalty for local business
            </span>
          </Link>
          <nav
            aria-label="Primary"
            className="hidden items-center gap-1 lg:flex"
          >
            {[
              { label: "Product", href: "#product" },
              { label: "How it works", href: "#how" },
              { label: "Roles", href: "#roles" },
              { label: "Pricing", href: "#pricing" },
              { label: "Security", href: "#security" },
            ].map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:ring-3 focus-visible:outline-none"
              >
                {label}
              </Link>
            ))}
          </nav>
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

      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 focus:outline-none"
      >
        {/* Hero */}
        <section
          aria-labelledby="hero-heading"
          className="relative overflow-hidden"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(52rem_28rem_at_50%_-8rem,var(--muted)_0%,transparent_65%)] dark:opacity-40"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(60rem_30rem_at_50%_0%,black_30%,transparent_75%)] bg-[size:44px_44px] opacity-40"
          />
          <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 pt-16 pb-14 sm:px-6 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700">
              <p className="flex flex-wrap items-center gap-2">
                <Badge>New: stamp cards + points</Badge>
                <span className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
                  For cafés, salons, gyms &amp; retail
                </span>
              </p>
              <h1
                id="hero-heading"
                className="mt-5 max-w-xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl"
              >
                Turn one-time visitors into regulars.
              </h1>
              <p className="text-muted-foreground mt-5 max-w-xl text-base leading-relaxed sm:text-lg">
                Launch a points program —{" "}
                <span className="font-mono">€1 = 1 pt, 100 pts = €5</span> — or
                a stamp card —{" "}
                <span className="font-mono">buy 9, get the 10th free</span>.
                Customers join by QR, staff award in two taps, rewards verify at
                the counter.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" render={<Link href="/sign-up" />}>
                  Create your program
                  <ArrowRightIcon />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  render={<Link href="/preview" />}
                >
                  See the live demo
                </Button>
              </div>
              <ul className="text-muted-foreground mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {[
                  "No POS integration needed",
                  "QR join in seconds",
                  "Isolated per merchant",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <CheckIcon
                      aria-hidden="true"
                      className="text-foreground size-4"
                    />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Product mock */}
            <div
              aria-label="Preview of a member card, stamp card and join QR"
              className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-6 motion-safe:delay-150 motion-safe:duration-700"
            >
              <div className="relative mx-auto mt-12 max-w-sm lg:mt-4">
                <Card className="relative z-10 shadow-lg">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg"
                        >
                          <CoffeeIcon className="size-4" />
                        </span>
                        <div>
                          <CardTitle>Café Aroma</CardTitle>
                          <CardDescription>
                            Hello Hicham · member
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <div>
                      <div className="text-muted-foreground flex items-center justify-between text-xs">
                        <span>Progress to €15 reward</span>
                        <span className="font-mono">245 / 500</span>
                      </div>
                      <div
                        role="img"
                        aria-label="245 of 500 points earned"
                        className="bg-muted mt-2 h-2 overflow-hidden rounded-full"
                      >
                        <div className="bg-primary h-full w-[49%] rounded-full" />
                      </div>
                    </div>
                    <ul className="flex flex-col gap-2 text-sm">
                      <li className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <span className="flex items-center gap-2 font-medium">
                          <GiftIcon
                            aria-hidden="true"
                            className="text-muted-foreground size-4"
                          />
                          €5 off
                        </span>
                        <span className="text-muted-foreground font-mono text-xs">
                          100 pts
                        </span>
                      </li>
                      <li className="flex items-center justify-between rounded-lg border px-3 py-2">
                        <span className="flex items-center gap-2 font-medium">
                          <StarIcon
                            aria-hidden="true"
                            className="text-muted-foreground size-4"
                          />
                          Free cappuccino
                        </span>
                        <span className="text-muted-foreground font-mono text-xs">
                          250 pts
                        </span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <Card
                  size="sm"
                  className="absolute -bottom-14 -left-4 z-20 w-44 shadow-lg sm:-left-10"
                >
                  <CardContent className="flex items-center gap-3 pt-3">
                    <span
                      aria-hidden="true"
                      className="bg-muted flex size-10 items-center justify-center rounded-lg"
                    >
                      <QrCodeIcon className="size-5" />
                    </span>
                    <div className="text-xs">
                      <p className="font-medium">Member QR</p>
                      <p className="text-muted-foreground font-mono">
                        cofe_m_9f3k…
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card
                  size="sm"
                  className="absolute -top-12 -right-2 z-20 w-52 shadow-lg sm:-right-6"
                >
                  <CardContent className="pt-3">
                    <p className="text-xs font-medium">Stamp card · 9/10</p>
                    <p
                      role="img"
                      aria-label="9 out of 10 stamps collected"
                      className="mt-2 flex gap-1"
                    >
                      {Array.from({ length: 10 }).map((_, i) => (
                        <span
                          key={i}
                          aria-hidden="true"
                          className={
                            i < 9
                              ? "bg-primary text-primary-foreground flex size-4 items-center justify-center rounded-full"
                              : "size-4 rounded-full border border-dashed"
                          }
                        >
                          {i < 9 ? <CoffeeIcon className="size-2.5" /> : null}
                        </span>
                      ))}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6">
            <ul
              aria-label="Built for local business categories"
              className="flex flex-wrap gap-2"
            >
              {CATEGORIES.map((c) => (
                <li key={c.label}>
                  <Badge
                    variant="outline"
                    className="h-7 gap-1.5 px-3 text-[13px]"
                  >
                    <c.icon aria-hidden="true" />
                    {c.label}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section
          aria-labelledby="how-heading"
          id="how"
          className="scroll-mt-20 border-t"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
              How it works
            </p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <h2
                id="how-heading"
                className="max-w-xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
              >
                Scan, earn, redeem — the whole loop in three taps.
              </h2>
              <Button variant="outline" render={<Link href="/onboarding" />}>
                Start onboarding
                <ArrowRightIcon />
              </Button>
            </div>
            <ol className="mt-8 grid gap-4 lg:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n}>
                  <Card className="hover:bg-muted/40 h-full transition-colors">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <span
                          aria-hidden="true"
                          className="bg-muted flex size-9 items-center justify-center rounded-lg"
                        >
                          <s.icon className="size-4" />
                        </span>
                        <span className="text-muted-foreground font-mono text-xs">
                          {s.n}
                        </span>
                      </div>
                      <CardTitle className="mt-3">{s.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {s.body}
                      </p>
                      <Link
                        href={s.cta.href}
                        className="focus-visible:ring-ring/50 mt-auto inline-flex items-center gap-1 rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:outline-none"
                      >
                        {s.cta.label}
                        <ArrowRightIcon
                          aria-hidden="true"
                          className="size-3.5"
                        />
                      </Link>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Loyalty models */}
        <section
          aria-labelledby="models-heading"
          id="product"
          className="bg-muted/30 scroll-mt-20 border-t"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
              One model per program
            </p>
            <h2
              id="models-heading"
              className="mt-2 max-w-xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
            >
              Points for spend, stamps for visits.
            </h2>
            <p className="text-muted-foreground mt-2 max-w-prose text-sm leading-relaxed">
              Pick exactly one model per merchant. Rules are validated and
              versioned server-side, so history always keeps the rule context it
              was earned under.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CoinsIcon
                      aria-hidden="true"
                      className="text-muted-foreground size-4"
                    />
                    Points
                  </CardTitle>
                  <CardDescription>
                    Best for baskets that vary — cafés, retail, restaurants.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="bg-background overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-relaxed">
                    {`Spend €1 → 1 point
100 points → €5 reward
250 points → €15 reward`}
                  </pre>
                  <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                    Configure earn rate, rounding, minimum purchase, expiration
                    and thresholds.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CoffeeIcon
                      aria-hidden="true"
                      className="text-muted-foreground size-4"
                    />
                    Stamp card
                  </CardTitle>
                  <CardDescription>
                    Best for repeat rituals — coffee, cuts, classes.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="bg-background overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-relaxed">
                    {`1 qualifying visit → 1 stamp
10 stamps → free coffee
Max 2 stamps / transaction`}
                  </pre>
                  <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                    Configure qualifying purchase, required stamps, expiration
                    and per-visit caps.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Roles */}
        <section
          aria-labelledby="roles-heading"
          id="roles"
          className="scroll-mt-20 border-t"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
              Product tour
            </p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2
                  id="roles-heading"
                  className="text-2xl font-semibold tracking-tight sm:text-3xl"
                >
                  A workspace for every role.
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Jump straight into each console — or open the demo switcher to
                  preview permissions.
                </p>
              </div>
              <Button variant="outline" render={<Link href="/preview" />}>
                Open role switcher
                <ArrowRightIcon />
              </Button>
            </div>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ROLES.map((role) => (
                <li key={role.title}>
                  <Link
                    href={role.href}
                    className="group hover:bg-muted/50 focus-visible:ring-ring/50 flex h-full flex-col gap-3 rounded-xl border p-4 transition-colors focus-visible:ring-3 focus-visible:outline-none"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-muted flex size-8 items-center justify-center rounded-lg"
                    >
                      <role.icon className="size-4" />
                    </span>
                    <span className="text-sm leading-snug font-medium">
                      {role.title}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {role.blurb}
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
                      Open console
                      <ArrowRightIcon
                        aria-hidden="true"
                        className="size-3 transition-transform group-hover:translate-x-0.5"
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Pricing */}
        <section
          aria-labelledby="pricing-heading"
          id="pricing"
          className="bg-muted/30 scroll-mt-20 border-t"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
              Pricing teaser
            </p>
            <h2
              id="pricing-heading"
              className="mt-2 max-w-xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
            >
              Start free. Upgrade when the line is out the door.
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Sample pricing — limits map to staff seats, members, rewards and
              analytics level.
            </p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PLANS.map((p) => (
                <li key={p.name}>
                  <Card
                    className={
                      p.featured
                        ? "border-primary ring-primary ring-1"
                        : "h-full"
                    }
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle>{p.name}</CardTitle>
                        {p.featured ? <Badge>Most popular</Badge> : null}
                      </div>
                      <p className="mt-2">
                        <span className="text-3xl font-semibold tracking-tight">
                          {p.price}
                        </span>{" "}
                        <span className="text-muted-foreground text-xs">
                          {p.per}
                        </span>
                      </p>
                      <CardDescription>{p.blurb}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                      <ul className="text-muted-foreground flex flex-col gap-1.5 text-[13px]">
                        {p.features.map((f) => (
                          <li key={f} className="flex gap-1.5">
                            <CheckIcon
                              aria-hidden="true"
                              className="text-foreground mt-0.5 size-3.5 shrink-0"
                            />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <Button
                        variant={p.featured ? "default" : "outline"}
                        className="mt-auto w-full"
                        render={<Link href="/sign-up" />}
                      >
                        {p.cta}
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Trust */}
        <section
          aria-labelledby="security-heading"
          id="security"
          className="scroll-mt-20 border-t"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
              Trust &amp; security
            </p>
            <h2
              id="security-heading"
              className="mt-2 max-w-xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
            >
              Access is enforced on the server.
            </h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {TRUST.map((t) => (
                <li key={t.title} className="rounded-xl border p-5">
                  <t.icon
                    aria-hidden="true"
                    className="text-muted-foreground mb-3 size-4"
                  />
                  <p className="text-sm font-medium">{t.title}</p>
                  <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
                    {t.body}
                  </p>
                </li>
              ))}
            </ul>
            <div className="text-muted-foreground mt-6 flex items-center gap-2 text-xs">
              <BarChart3Icon aria-hidden="true" className="size-4" />
              Merchant analytics stay tenant-scoped; platform metrics live
              separately under /admin.
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section aria-labelledby="cta-heading" className="border-t">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
            <div className="bg-primary text-primary-foreground rounded-2xl px-6 py-12 text-center sm:px-12">
              <p className="font-mono text-xs tracking-widest uppercase opacity-70">
                From signup to first stamp in minutes
              </p>
              <h2
                id="cta-heading"
                className="mx-auto mt-3 max-w-xl text-2xl font-semibold tracking-tight text-balance sm:text-4xl"
              >
                Print your join QR. Greet your first member today.
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed opacity-80">
                Business profile → loyalty model → first reward → activate.
                Resume anytime where you left off.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button
                  size="lg"
                  variant="secondary"
                  render={<Link href="/sign-up" />}
                >
                  Create your program
                  <ArrowRightIcon />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground bg-transparent"
                  render={<Link href="/preview" />}
                >
                  Explore the demo
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div>
            <p className="flex items-center gap-2 font-semibold">
              <span
                aria-hidden="true"
                className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg"
              >
                <CoffeeIcon className="size-4" />
              </span>
              Cofe
            </p>
            <p className="text-muted-foreground mt-2 max-w-xs text-[13px] leading-relaxed">
              Multi-tenant loyalty for cafés, restaurants, salons, gyms and
              local retail.
            </p>
          </div>
          <nav aria-label="Product">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Product
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {[
                { label: "How it works", href: "#how" },
                { label: "Loyalty models", href: "#product" },
                { label: "Pricing", href: "#pricing" },
                { label: "Security", href: "#security" },
              ].map(({ label, href }) => (
                <li key={href + label}>
                  <Link
                    href={href}
                    className="text-muted-foreground hover:text-foreground text-[13px] hover:underline hover:underline-offset-4"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Consoles">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Consoles
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {[
                { label: "Merchant dashboard", href: "/dashboard" },
                { label: "Counter register", href: "/register" },
                { label: "Customer portal", href: "/me" },
                { label: "Platform admin", href: "/admin" },
              ].map(({ label, href }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-muted-foreground hover:text-foreground text-[13px] hover:underline hover:underline-offset-4"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Account">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Account
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {[
                { label: "Sign up", href: "/sign-up" },
                { label: "Sign in", href: "/sign-in" },
                { label: "Onboarding", href: "/onboarding" },
                { label: "Role demo", href: "/preview" },
              ].map(({ label, href }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-muted-foreground hover:text-foreground text-[13px] hover:underline hover:underline-offset-4"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="border-t">
          <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>© 2026 Cofe. Sample data in demo workspaces.</p>
            <p className="font-mono">Points · Stamps · Rewards · Redemptions</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
