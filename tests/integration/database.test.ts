import type { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/connection";
import { isPostgresReachable } from "../helpers/services";

/**
 * Database connectivity smoke test (checklist §2). Skips — loudly — when
 * PostgreSQL is not running so a developer without services still gets a green
 * unit run and a clear instruction instead of a timeout.
 */

const postgresReachable = await isPostgresReachable();

if (!postgresReachable) {
  console.warn(
    `[test] PostgreSQL is not reachable at ${describeDsn()} — skipping connectivity tests. Start local services with \`pnpm services:up\`.`,
  );
}

function describeDsn(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return "DATABASE_URL (unset)";
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "DATABASE_URL (invalid)";
  }
}

describe.skipIf(!postgresReachable)("PostgreSQL connectivity", () => {
  let db: DataSource;

  beforeAll(async () => {
    db = await getDb();
  }, 15_000);

  afterAll(async () => {
    await closeDb();
  });

  it("initialises the shared DataSource", () => {
    expect(db.isInitialized).toBe(true);
  });

  it("answers a basic query", async () => {
    const rows = await db.query<Array<{ ok: number }>>("select 1 as ok");
    expect(rows[0]?.ok).toBe(1);
  });
});
