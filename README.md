# B2B Multi-Tenant Loyalty SaaS (Phase 1 MVP)

Multi-tenant loyalty platform for cafés, restaurants, salons, gyms and other local
businesses. Product requirements live in [`prd.md`](./prd.md); sequenced engineering
work lives in [`checklist.md`](./checklist.md).

## Stack

| Concern          | Choice                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Framework        | Next.js 16 (App Router) + TypeScript (strict)                                                               |
| UI               | shadcn/ui components + Tailwind CSS v4                                                                      |
| System of record | PostgreSQL + TypeORM (migrations only, no schema sync)                                                      |
| Cache/jobs       | Redis via ioredis (cache, rate limiting, async jobs — never the system of record)                           |
| Authentication   | Better Auth + `better-auth-typeorm-adapter` — see [ADR 0001](./docs/adr/0001-authentication-better-auth.md) |
| Entity modeling  | TypeORM `EntitySchema` (no decorators) — see [ADR 0002](./docs/adr/0002-typeorm-entityschema.md)            |
| Validation       | zod                                                                                                         |
| Logging          | pino (structured, redacting, correlation ids)                                                               |
| Tests            | Vitest (unit/integration/smoke), Playwright + axe (e2e/a11y)                                                |
| Tooling          | pnpm, ESLint, Prettier, tsx (CLI scripts), Docker Compose (local services)                                  |

## Prerequisites (pinned)

- **Node.js LTS 24** — pinned in [`.nvmrc`](./.nvmrc) and `engines` in `package.json`.
  Use `nvm use` (or any version manager) to pick it up.
- **pnpm 12** — pinned via the `packageManager` field (Corepack). Enable it once with
  `corepack enable`.
- **Docker with Compose v2** — for the local PostgreSQL and Redis services. Any other
  reachable PostgreSQL 17 / Redis 7 works too: point `DATABASE_URL`/`REDIS_URL` in
  `.env` at it and skip `pnpm services:up`.

## Quickstart (documented CLI workflow)

```bash
pnpm install                 # install dependencies (lockfile: pnpm-lock.yaml)
cp .env.example .env         # then fill it in — see "Secrets and environment"
pnpm dlx auth@latest secret  # paste the result into BETTER_AUTH_SECRET
pnpm services:up             # local PostgreSQL + Redis (waits until healthy)
pnpm db:migrate              # apply database migrations
pnpm db:seed                 # seed local development data
pnpm dev                     # start the app (http://localhost:3000)
pnpm smoke                   # verify configuration, PostgreSQL and Redis
```

Configuration is validated when the server boots: a missing or malformed variable
aborts startup with the full list of problems, so the first `pnpm dev` failure tells
you exactly what to fix.

## Application surfaces (checklist §3)

Each audience has its own route group and shell; `src/auth/guard.ts` runs on every
page **and** API route, so hidden navigation is never the authorization.

| Audience         | Shell            | Routes                                                                                                                 |
| ---------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Anyone           | Product landing  | `/`                                                                                                                    |
| Anonymous        | Auth wall        | `/sign-in` (guards redirect here); denied roles land on `/403`                                                         |
| Platform admin   | Administration   | `/admin`, `/admin/merchants`, `/admin/users`, `/admin/analytics`, `/admin/settings`                                    |
| Merchant owner   | Merchant setup   | `/onboarding` (business profile → loyalty model → first reward → activate + join QR); resumes at the first gap         |
| Merchant owner   | Merchant console | `/dashboard`, `/customers`, `/loyalty`, `/transactions`, `/rewards`, `/campaigns`, `/staff`, `/analytics`, `/settings` |
| Merchant manager | Merchant console | same pages, business settings read-only, no destructive actions                                                        |
| Staff / cashier  | Counter register | `/register`, `/register/customers`, `/register/rewards`, `/register/transactions`                                      |
| Customer         | Customer portal  | `/me`, `/me/rewards`, `/me/offers`, `/me/activity`, `/me/profile`                                                      |

- **Role preview (development only).** Real sessions come from Better Auth (§5);
  `POST /api/preview` (form-encoded `role=<ROLE>`) is a dev-only overlay that sets an
  httpOnly `cofe_preview_role` cookie for 8 hours, honored only when `isPreviewEnabled()` —
  production ignores the cookie and returns 404. The `/preview` page and the account
  menu's "view as role" switch drive it, and server guards read the same context, so
  what you preview is exactly what is enforced. Anonymous requests are rejected:
  pages redirect to `/sign-in`, `/api/me` returns 401.
- **Password reset and verification emails are captured, not sent.** Without an SMTP
  provider, `src/integrations/email` records every message in a bounded in-memory
  outbox; `GET /api/dev/outbox` (dev only, 404 in production) lists them so you can
  open the reset/verification link locally.
- **Data is a process-local demo store** (`src/lib/demo-store.ts`). Mutations survive
  while the dev server runs and reset on restart; PostgreSQL + TypeORM replaces it in
  §4.
- **Shared patterns** live in `src/components/patterns` (form, data-table, confirm,
  states, filter-select, toast, status-badge) and `src/components/shell` (app shell,
  side nav, mobile nav, user menu). Value-affecting actions go through an explicit
  confirmation and report the result via toast.

## Scripts

| Script                                               | Purpose                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                                           | Start the dev server (Next.js App Router)                                                                                      |
| `pnpm build` / `pnpm start`                          | Production build / serve                                                                                                       |
| `pnpm lint` / `pnpm lint:fix`                        | ESLint check / autofix                                                                                                         |
| `pnpm format` / `pnpm format:check`                  | Prettier write / verify                                                                                                        |
| `pnpm typecheck`                                     | `tsc --noEmit` — `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride` |
| `pnpm test` / `pnpm test:watch`                      | Vitest unit, integration and smoke tests                                                                                       |
| `pnpm test:e2e`                                      | Playwright end-to-end tests                                                                                                    |
| `pnpm validate`                                      | format:check + lint + typecheck + test (the CI gate)                                                                           |
| `pnpm smoke`                                         | Configuration + PostgreSQL + Redis checks (`-- --http` adds the running server)                                                |
| `pnpm services:up` / `:logs` / `:down` / `:reset`    | Local PostgreSQL and Redis containers (see below)                                                                              |
| `pnpm db:migrate`                                    | Apply pending TypeORM migrations                                                                                               |
| `pnpm db:migrate:show`                               | List migrations and their state                                                                                                |
| `pnpm db:migrate:generate -- src/db/migrations/Name` | Generate a migration from entity changes                                                                                       |
| `pnpm db:migrate:revert`                             | Revert the last applied migration                                                                                              |
| `pnpm db:seed`                                       | Repeatable development seed (never run on production)                                                                          |

All commands run from the repository root. `db:*` and `smoke` scripts read `.env` if
present (Node `--env-file-if-exists`) and otherwise use exported environment
variables.

## Local services

`docker-compose.yml` runs the two services the application needs, with health checks:

| Service    | Image                | Host port (default) | Data                         |
| ---------- | -------------------- | ------------------- | ---------------------------- |
| PostgreSQL | `postgres:17-alpine` | `5433`              | named volume `postgres_data` |
| Redis      | `redis:7-alpine`     | `6380`              | named volume `redis_data`    |

Ports default to `5433`/`6380` so they never collide with a system-wide PostgreSQL or
Redis. Override `POSTGRES_PORT`/`REDIS_PORT` in `.env` if you want the conventional
ports (and keep `DATABASE_URL`/`REDIS_URL` in sync).

| Script                | Purpose                                               |
| --------------------- | ----------------------------------------------------- |
| `pnpm services:up`    | Start services and wait until both report healthy     |
| `pnpm services:logs`  | Follow container logs                                 |
| `pnpm services:down`  | Stop the services (data survives in the volumes)      |
| `pnpm services:reset` | Stop and **delete** the volumes — destroys local data |

These containers are for development only (no TLS, well-known credentials). Production
services are provisioned separately — see checklist §14.

## Health checks

`GET /api/health` reports the application, PostgreSQL and Redis:

```json
{
  "status": "ok",
  "timestamp": "2026-09-29T20:00:00.000Z",
  "uptimeSeconds": 12,
  "checks": {
    "app": {
      "status": "ok",
      "latencyMs": 0,
      "details": { "node": "v24.12.0", "runtime": "nodejs" }
    },
    "postgres": { "status": "ok", "latencyMs": 4 },
    "redis": { "status": "ok", "latencyMs": 2 }
  }
}
```

- `200` when everything is reachable, `503` otherwise, always `cache-control: no-store`.
- Each dependency is probed with a hard timeout, so a dead service answers quickly
  instead of hanging.
- The body contains no connection strings, credentials or driver messages; the real
  error goes to the structured logs under the same correlation id.
- CI and `pnpm smoke -- --http` use this endpoint to prove the app actually starts.

## Logging and error handling

- **Structured logs.** Every server log line is JSON (pino), level controlled by
  `LOG_LEVEL`. Errors are serialized with their stack, but credentials embedded in
  driver messages are scrubbed first.
- **Correlation ids.** `src/proxy.ts` accepts or mints an `x-request-id`, forwards it
  to the handler and echoes it on the response. Handlers wrapped in `withApiHandler`
  bind it to every log line, so one id joins the proxy log, the handler log and the
  error log:

  ```bash
  grep '"requestId":"0f1e..."' logs.json
  ```

- **Redaction is central.** Passwords, tokens, session material, redemption/verification
  codes and personal data (email, phone, name) are redacted by the logger itself — see
  `redactionPaths` in `src/lib/logger.ts`. Callers log business events, never
  credentials.
- **Consistent API errors.** Route handlers are exported through `withApiHandler`:

  ```ts
  export const GET = withApiHandler(async (request) => {
    const reward = await findReward(...);
    if (!reward) throw new NotFoundError("Reward not found.");
    return Response.json(reward);
  });
  ```

  Failures return one envelope — stack traces, SQL and driver detail never leave the
  server:

  ```json
  {
    "error": {
      "code": "not_found",
      "message": "Reward not found.",
      "requestId": "0f1e…"
    }
  }
  ```

  Throw `AppError` subclasses (`ValidationError`, `NotFoundError`, `ForbiddenError`,
  …) for expected outcomes; anything else becomes an opaque `internal_error` and is
  logged in full.

## Secrets and environment

- Configuration lives in environment variables. `.env.example` documents every name
  with non-secret placeholders only and is the only env file that is committed.
- `.env`, `.env.*` are git-ignored (`.env.example` is explicitly un-ignored).
- Generate the auth secret with `pnpm dlx auth@latest secret`. Startup fails fast if
  it is missing, shorter than 32 characters, or still the placeholder.
- Never log credentials, session cookies, reset tokens or redemption codes.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request with its own PostgreSQL
and Redis service containers:

```text
format:check → lint → typecheck → db:migrate → test → build → smoke -- --http
```

The last step starts the production server and asserts `GET /api/health` returns 200,
so a change that cannot boot or cannot reach its dependencies fails the build.

## Working agreements

1. **Install via CLI only.** Dependencies: `pnpm add <pkg>` / `pnpm add -D <pkg>`;
   UI components: `pnpm dlx shadcn@latest add <component>`. Never hand-edit
   `package.json` dependencies or copy component source from unverified locations.
   Review generated files and `pnpm-lock.yaml` changes after every install.
2. **One package manager (pnpm) and one Node LTS line (24).** The lockfile must be
   committed with every dependency change.
3. **Database access runs on the Node.js runtime only.** Next.js 16 deprecates the
   Edge runtime; TypeORM-backed code must never be routed through it.
   `typeorm`, `ioredis`, `pino` and `reflect-metadata` are listed in
   `serverExternalPackages` in `next.config.ts` so they are not bundled into the
   server graph.
4. **Schema changes ship as reviewed migrations** (`pnpm db:migrate:generate` → review →
   `pnpm db:migrate`). `synchronize` stays `false` everywhere.
5. **Redis is narrowly scoped** — cache, rate limiting and asynchronous jobs only,
   through the single `src/lib/redis.ts` entry point. PostgreSQL is the only system
   of record; callers must define a safe fallback for when Redis is unavailable.
6. **API routes declare errors, not responses.** Export every handler through
   `withApiHandler` and throw `AppError` subclasses so error shape, logging and
   correlation ids stay consistent.
7. **Validate before you hand over:** `pnpm validate`, then `pnpm smoke`.

## Repository layout

Feature-oriented: routes stay thin, domain logic lives with its feature, and
cross-cutting concerns live in `src/lib`.

```text
src/
  app/                  Routes: pages, layouts and API handlers (validate → authorize → delegate)
    (platform)/         Platform administrator console — /admin (§3)
    (merchant)/         Merchant owner/manager console (§3)
    (staff)/            Counter register — /register (§3)
    (customer)/         Customer portal — /me (§3)
    api/health/         Health endpoint (checklist §2)
    api/preview/        Dev-only role preview cookie (checklist §3)
    api/auth/           Better Auth catch-all handler (checklist §5)
    api/dev/outbox/     Dev-only captured auth emails (checklist §5)
    page.tsx            Product landing; plus sign-in and 403 shells
  auth/                 Roles, permissions, session and tenant guards (checklist §5)
  components/           UI components
    ui/                 shadcn/ui primitives
    shell/              App shells and navigation (§3)
    patterns/           Form, table, dialog, confirm, toast patterns (§3)
  db/                   Persistence (Node.js runtime only)
    connection.ts       Lazy runtime DataSource access (`getDb()`)
    data-source.ts      TypeORM DataSource used by CLI scripts
    entities/           EntitySchema definitions
    migrations/         TypeORM migrations — the only schema change path
  features/             Domain logic, one folder per feature
    merchants/          Merchant onboarding and profile (§6)
    customers/          Customer enrollment and identity (§7)
    loyalty/            Loyalty rules and ledger service (§8)
    rewards/            Rewards and redemption (§9)
    redemptions/        Redemption verification (§9)
    campaigns/          Campaigns (§10)
    analytics/          Merchant and platform metrics (§11)
    platform/           Super-admin operations (§11)
  integrations/         Provider-neutral adapters: email (§5), POS, Wallet, WhatsApp, SMS (§12)
  lib/                  Cross-cutting server utilities
    env.ts              Environment schema + fail-fast validation
    logger.ts           pino logger, redaction, correlation-aware `getLogger()`
    request-context.ts  Correlation id storage (`x-request-id`)
    api.ts              `withApiHandler` — logging, error envelope
    errors.ts           `AppError` hierarchy and `toAppError`
    health.ts           Application / PostgreSQL / Redis checks
    redis.ts            Single Redis entry point (narrowly scoped)
    rate-limit.ts       Redis-backed throttling for auth endpoints (§5)
    audit.ts            Append-only `audit_log` writer (§5)
    startup.ts          Node-only boot work: validate config, log, abort on error
    demo-store.ts       Session-local demo data until PostgreSQL (§4)
    actions.ts          Server actions shared by the §3 pages
  instrumentation.ts    Startup hook: runs `startup.ts` before serving traffic
  proxy.ts              Assigns and propagates the correlation id
scripts/                CLI entry points (smoke, seed, maintenance)
tests/
  helpers/              Shared test utilities (service reachability probes)
  integration/          PostgreSQL-backed tests — skip loudly when no database
  smoke/                Application startup and health smoke tests
  e2e/                  Playwright end-to-end tests (checklist §13)
docs/adr/               Architecture decision records
```

Rules of thumb:

- A feature folder owns its domain logic and its tests; features do not reach into
  another feature's internals — shared behaviour moves to `src/lib` or a dedicated
  module.
- Anything that talks to PostgreSQL goes through `src/db`; anything that talks to
  Redis goes through `src/lib/redis.ts`.
- Authorization decisions are made in `src/auth` on the server, never in the UI.

## Architecture decisions

- [ADR 0001 — Authentication: Better Auth](./docs/adr/0001-authentication-better-auth.md)
- [ADR 0002 — TypeORM EntitySchema instead of decorators](./docs/adr/0002-typeorm-entityschema.md)
