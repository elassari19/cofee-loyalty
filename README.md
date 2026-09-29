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
| Logging          | pino (structured, redacting)                                                                                |
| Tests            | Vitest (unit/integration), Playwright + axe (e2e/a11y)                                                      |
| Tooling          | pnpm, ESLint, Prettier, tsx (CLI scripts)                                                                   |

## Prerequisites (pinned)

- **Node.js LTS 24** — pinned in [`.nvmrc`](./.nvmrc) and `engines` in `package.json`.
  Use `nvm use` (or any version manager) to pick it up.
- **pnpm 12** — pinned via the `packageManager` field (Corepack). Enable it once with
  `corepack enable`.
- PostgreSQL and Redis for local development (see checklist §2 for the Docker Compose
  setup; until then point `DATABASE_URL`/`REDIS_URL` at any reachable instances).

## Quickstart (documented CLI workflow)

```bash
pnpm install                    # install dependencies (lockfile: pnpm-lock.yaml)
cp .env.example .env            # fill in local values (never commit .env)
pnpm db:migrate                 # apply database migrations
pnpm db:seed                    # seed local development data
pnpm dev                        # start the app (http://localhost:3000)
```

## Scripts

| Script                                               | Purpose                                               |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `pnpm dev`                                           | Start the dev server (Next.js App Router)             |
| `pnpm build` / `pnpm start`                          | Production build / serve                              |
| `pnpm lint` / `pnpm lint:fix`                        | ESLint check / autofix                                |
| `pnpm format` / `pnpm format:check`                  | Prettier write / verify                               |
| `pnpm typecheck`                                     | `tsc --noEmit` (strict)                               |
| `pnpm test` / `pnpm test:watch`                      | Vitest unit/integration tests                         |
| `pnpm test:e2e`                                      | Playwright end-to-end tests                           |
| `pnpm validate`                                      | format:check + lint + typecheck + test (CI gate)      |
| `pnpm db:migrate`                                    | Apply pending TypeORM migrations                      |
| `pnpm db:migrate:show`                               | List migrations and their state                       |
| `pnpm db:migrate:generate -- src/db/migrations/Name` | Generate a migration from entity changes              |
| `pnpm db:migrate:revert`                             | Revert the last applied migration                     |
| `pnpm db:seed`                                       | Repeatable development seed (never run on production) |

All commands are run from the repository root. `db:*` scripts read `.env` if present
(Node `--env-file-if-exists`) and otherwise use exported environment variables.

## Secrets and environment

- Configuration lives in environment variables. `.env.example` documents every name
  with non-secret placeholders only and is the only env file that is committed.
- `.env`, `.env.*` are git-ignored (`.env.example` is explicitly un-ignored).
- Generate the auth secret with `pnpm dlx auth@latest secret`.
- Never log credentials, session cookies, reset tokens or redemption codes.

## Working agreements

1. **Install via CLI only.** Dependencies: `pnpm add <pkg>` / `pnpm add -D <pkg>`;
   UI components: `pnpm dlx shadcn@latest add <component>`. Never hand-edit
   `package.json` dependencies or copy component source from unverified locations.
   Review generated files and `pnpm-lock.yaml` changes after every install.
2. **One package manager (pnpm) and one Node LTS line (24).** The lockfile must be
   committed with every dependency change.
3. **Database access runs on the Node.js runtime only.** Next.js 16 deprecates the
   Edge runtime; TypeORM-backed code must never be routed through it.
   `typeorm`, `ioredis` and `reflect-metadata` are listed in `serverExternalPackages`
   in `next.config.ts` so they are not bundled into the server graph.
4. **Schema changes ship as reviewed migrations** (`pnpm db:migrate:generate` → review →
   `pnpm db:migrate`). `synchronize` stays `false` everywhere.
5. **Redis is narrowly scoped** — cache, rate limiting and asynchronous jobs only,
   through the single `src/lib/redis.ts` entry point. PostgreSQL is the only system
   of record; callers must define a safe fallback for when Redis is unavailable.
6. **Validate before you hand over:** `pnpm validate`.

## Repository layout

```text
src/
  app/          Next.js App Router routes and API handlers
  components/   UI components (shadcn/ui primitives in components/ui)
  db/           TypeORM DataSource, entities, migrations
  lib/          shared utilities
scripts/        CLI entry points (seeds, maintenance tasks)
docs/adr/       architecture decision records
tests/          test suites (unit, integration, e2e)
```

## Architecture decisions

- [ADR 0001 — Authentication: Better Auth](./docs/adr/0001-authentication-better-auth.md)
- [ADR 0002 — TypeORM EntitySchema instead of decorators](./docs/adr/0002-typeorm-entityschema.md)
