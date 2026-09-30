# Database: Schema, Balances, Backup and Recovery

PostgreSQL 17 is the system of record (ADR 0001/0002, checklist §1 and §4).
Redis is a cache/rate-limit/queue helper only — it is never the system of
record and needs no backup.

- **Driver**: TypeORM 0.3, `EntitySchema` entities in `src/db/entities/`,
  registered through the static `ENTITY_SCHEMAS` barrel.
- **Schema changes**: reviewed migration files in `src/db/migrations/` only.
  `synchronize: false` in `src/db/data-source.ts` — schema synchronization is
  never a migration strategy, in development or in production.
- **Local services**: `pnpm services:up` (PostgreSQL 17 in
  `loyalty-saas-postgres` on host port `5433`, database `loyalty_dev`).

## Schema map

| Table                 | Purpose                                                                                                                     | Tenant column                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `user`                | Platform identity (Better Auth). Platform `role`: `SUPER_ADMIN`/`MERCHANT`/`CUSTOMER`.                                      | — (platform)                                  |
| `customer_profile`    | Customer-facing profile, one per `user`.                                                                                    | — (platform)                                  |
| `merchant`            | Tenant record. `status`: trial/active/suspended.                                                                            | (is the tenant)                               |
| `merchant_membership` | Platform user ↔ merchant membership with tenant role (owner/manager/staff).                                                 | `merchant_id`                                 |
| `loyalty_program`     | Points or stamps configuration, versioned by `rule_version`. Partial unique: one `active` per merchant.                     | `merchant_id`                                 |
| `loyalty_membership`  | One customer's membership in one merchant; carries the **balance projection**. `UNIQUE (merchant_id, customer_profile_id)`. | `merchant_id`                                 |
| `loyalty_transaction` | **Immutable ledger**: signed `delta` per entry.                                                                             | `merchant_id`                                 |
| `reward`              | Redeemable reward, cost in the program's unit.                                                                              | `merchant_id`                                 |
| `reward_redemption`   | Opaque redemption code (stored as sha256 `code_hash`), lifecycle `ISSUED → VERIFIED → REDEEMED`.                            | `merchant_id`                                 |
| `campaign`            | Scheduled campaign with start/end window.                                                                                   | `merchant_id`                                 |
| `audit_log`           | **Immutable** audit trail of sensitive actions.                                                                             | `merchant_id` (nullable for platform actions) |
| `subscription`        | Plan and limits, one row per merchant.                                                                                      | `merchant_id`                                 |
| `integration_record`  | Provider identifier ↔ canonical entity mapping (§12 extension point).                                                       | `merchant_id`                                 |
| `migrations`          | Applied migration bookkeeping (TypeORM).                                                                                    | —                                             |

**Tenancy rules.** Every merchant-owned table has `merchant_id NOT NULL` with
tenant-scoped indexes. A customer identity (`user` + `customer_profile`) is
platform-level and joins any number of merchants through separate
`loyalty_membership` rows — balances never cross tenants. Cross-tenant writes
are rejected by `appendLedgerEntry` (`ForbiddenError`) and, for the ledger,
by the foreign-key graph.

## Balance strategy

Balances are a **transactionally maintained projection**:

1. Every balance change is one immutable row in `loyalty_transaction`
   (signed `delta`: positive earns, negative redeems, `*_ADJUSTED` corrects
   mistakes — history is never edited).
2. `src/db/ledger.ts` locks the membership row (`SELECT … FOR UPDATE`), appends
   the entry, and increments `loyalty_membership.balance` **inside the same
   transaction** (`src/db/transactions.ts`). Concurrent writers on one
   membership serialise on that lock; unrelated tenants never contend.
3. `CHECK (balance >= 0)` and the type/unit/sign CHECKs make the database the
   last line of defence.

**Reconciliation.** `readBalanceReport` / `assertProjectionMatchesLedger` in
`src/db/ledger.ts` compare the projection with `SUM(delta)`; the integration
suite `tests/integration/ledger.test.ts` asserts this after earns,
adjustments, redemptions, rollbacks and a concurrent-redemption storm.
Manual check (must return zero rows):

```sql
SELECT m.id, m.balance AS projected, COALESCE(SUM(t.delta), 0) AS ledger
  FROM loyalty_membership m
  LEFT JOIN loyalty_transaction t ON t.membership_id = m.id
 GROUP BY m.id, m.balance
HAVING m.balance <> COALESCE(SUM(t.delta), 0);
```

## Ledger and audit immutability

`loyalty_transaction` and `audit_log` are append-only, enforced by the
`prevent_row_mutation()` trigger (`trg_loyalty_transaction_append_only`,
`trg_audit_log_append_only`) created in the initial migration: any `UPDATE` or
`DELETE` raises an error.

- **Normal corrections**: append a reversing/adjusting entry through
  `recordAdjustment` (reason required) — never edit rows.
- **Maintenance repair** (corrupt fixture/test data only, documented
  procedure): in a maintenance window, with a written reason, temporarily
  disable the trigger, remove the bad rows, re-enable:

  ```sql
  ALTER TABLE loyalty_transaction DISABLE TRIGGER trg_loyalty_transaction_append_only;
  -- scoped DELETE of the offending rows (always filter by merchant_id/id)
  ALTER TABLE loyalty_transaction ENABLE TRIGGER trg_loyalty_transaction_append_only;
  ```

  The integration tests use exactly this procedure to purge their fixtures.

`updated_at` is maintained by the `set_updated_at()` trigger on every table
that has the column, so any writer (app, CLI, raw SQL) keeps it fresh.

## Migrations

| Command                           | Effect                                                 |
| --------------------------------- | ------------------------------------------------------ |
| `pnpm db:migrate`                 | Apply pending migrations to `DATABASE_URL`.            |
| `pnpm db:migrate:show`            | List applied and pending migrations.                   |
| `pnpm db:migrate:revert`          | Revert the most recently applied migration (one step). |
| `pnpm db:migrate:generate <Name>` | Diff entities vs database into a new migration file.   |

**Workflow for every schema change**

1. Edit the entity (`src/db/entities/*.entity.ts`) — constraints, indexes and
   CHECKs live in the entity so the diff is reviewable.
2. Generate: `pnpm db:migrate:generate AddThing`.
3. **Review and patch the generated file** — the generator does not know about
   our conventions. Required patches, verified in
   `1790787191893-InitialDataFoundation.ts`:
   - `uuid_generate_v4()` → `gen_random_uuid()` (built into PostgreSQL ≥ 13;
     avoids depending on the `uuid-ossp` extension).
   - First line must be `import type { MigrationInterface, QueryRunner } from
"typeorm";` — TypeORM loads migration files with a native dynamic
     import during `DataSource.initialize()`, where a value import of these
     type-only symbols fails.
   - Trigger/function DDL (`set_updated_at`, `prevent_row_mutation`) is
     hand-written; the generator only manages tables, columns, indexes and
     foreign keys.
4. Apply to a scratch database first (from-empty proof):
   `docker exec loyalty-saas-postgres psql -U postgres -c "CREATE DATABASE loyalty_gen"`
   then `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/loyalty_gen pnpm db:migrate`.
5. Apply to the working database (`pnpm db:migrate`) and run `pnpm test`.

Never enable `synchronize` outside a disposable experiment, and never as a
production migration strategy.

## Backup

**Local development** (container `loyalty-saas-postgres`):

```bash
docker exec loyalty-saas-postgres pg_dump -U postgres -d loyalty_dev -Fc -f /tmp/loyalty_dev.dump
docker cp loyalty-saas-postgres:/tmp/loyalty_dev.dump ./loyalty_dev.backup
```

The Docker named volume `postgres_data` also survives `pnpm services:down`
(use `pnpm services:reset` only when you _want_ to destroy local data).

**Production** (checklist §14):

- Use the managed provider's automated backups (daily full + continuous WAL
  archiving), with a retention window agreed for the product (e.g. 30 days).
- Additionally take a logical `pg_dump -Fc` before every migration deploy;
  this is the fastest point-in-time artifact for a bad deploy.
- Back up only PostgreSQL. Redis holds caches, rate-limit counters and queues;
  flushing it is recoverable behaviour, not data loss.
- Rotate and test the restore procedure — an untested backup is not a backup.

## Restore

Restore into a **scratch database first**, verify, then swap:

```bash
docker exec loyalty-saas-postgres psql -U postgres -c "CREATE DATABASE loyalty_restore"
docker cp ./loyalty_dev.backup loyalty-saas-postgres:/tmp/loyalty_dev.backup
docker exec loyalty-saas-postgres pg_restore -U postgres -d loyalty_restore /tmp/loyalty_dev.backup
```

Verification checklist:

```bash
# 1. Schema version matches the source
docker exec loyalty-saas-postgres psql -U postgres -d loyalty_restore -c \
  "SELECT name FROM migrations ORDER BY timestamp;"
# 2. Row counts look sane (ledger must not be empty if it was not empty before)
docker exec loyalty-saas-postgres psql -U postgres -d loyalty_restore -c \
  "SELECT count(*) FROM loyalty_transaction; SELECT count(*) FROM merchant;"
# 3. Balances reconcile with the ledger (must return 0 rows) — see SQL above
```

Only then replace the live data (stop the app, drop/recreate `loyalty_dev`
from the dump or rename databases), restart, and re-run `pnpm db:migrate` —
it must report "no pending migrations" for a restored, current database.

## Migration rollback and recovery

- **Roll back one step**: `pnpm db:migrate:revert` (reverts the latest applied
  migration). Repeat to go further back. Reverting drops what the migration
  created — treat it as data-destructive and take a backup first.
- **Failed migration**: on PostgreSQL, TypeORM runs each migration inside a
  transaction — a failure rolls back and the row is never recorded in
  `migrations`. Fix the migration file, then re-run `pnpm db:migrate`.
- **Forward-fix preferred**: if a migration has already been applied in
  production and is wrong, write a _new_ migration that corrects it; do not
  edit or delete an applied migration file in shared environments.
- **Broken migration file** (syntax error discovered after apply): fix the
  file only in local/scratch environments; in production prefer a corrective
  forward migration.
- **Last resort**: restore from the pre-deploy backup (see Restore), then
  apply the corrected migration chain.

## Seeding

`pnpm db:seed` loads idempotent development data (two merchants, one customer
in both, points and stamp programs, ledger history, rewards, a campaign):

- Refuses to run when `NODE_ENV=production` or when `DATABASE_URL` points at
  a non-local host.
- Requires migrations to be applied first; every row uses fixed ids with
  `ON CONFLICT DO NOTHING` and every ledger movement uses a deterministic
  idempotency key, so re-running never double-counts.
- Creates **no passwords** — user credentials are provisioned by the
  authentication layer (checklist §5) through Better Auth, never by the seed.
