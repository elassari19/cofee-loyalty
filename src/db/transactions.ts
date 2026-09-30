import type { EntityManager } from "typeorm";
import { getDb } from "./connection";

/**
 * Transaction boundaries (checklist §4 — "Add transaction boundaries and
 * locking/concurrency strategy").
 *
 * Every write that spans more than one row runs inside `runInTransaction`:
 * the ledger append + balance projection (src/db/ledger.ts), reward issuance +
 * redemption creation, campaign state changes, anything that pairs an audit
 * row with the mutation it describes. A failure anywhere in the callback
 * rolls the whole unit back, so the projection can never drift from the
 * ledger because of a half-applied write.
 *
 * The default isolation level is PostgreSQL's own default, `READ COMMITTED`,
 * made explicit so the behaviour does not silently change with server
 * settings. Concurrency between writers is *not* handled by escalating the
 * isolation level: the ledger takes a row lock on `loyalty_membership`
 * (`SELECT ... FOR UPDATE`) for the duration of the transaction, which
 * serialises updates per membership while leaving unrelated tenants entirely
 * unaffected. Transactions must therefore stay short — no external calls,
 * no slow reads — to keep lock hold times near zero.
 *
 * ```ts
 * const entry = await runInTransaction((em) =>
 *   recordEarn(em, { membershipId, merchantId, unit: "POINTS", delta: 100 }),
 * );
 * ```
 */

/** PostgreSQL transaction isolation levels (TypeORM does not re-export its own). */
export type TransactionIsolationLevel =
  "READ UNCOMMITTED" | "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";

export interface TransactionOptions {
  /** Defaults to `READ COMMITTED` — PostgreSQL's default, stated explicitly. */
  isolationLevel?: TransactionIsolationLevel;
}

export async function runInTransaction<T>(
  run: (em: EntityManager) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const dataSource = await getDb();
  return dataSource.transaction(
    options.isolationLevel ?? "READ COMMITTED",
    run,
  );
}
