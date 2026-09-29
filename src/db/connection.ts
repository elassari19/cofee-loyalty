import type { DataSource } from "typeorm";
import { AppDataSource } from "./data-source";

/**
 * Runtime access to the PostgreSQL `DataSource` (persistence layer, checklist
 * §2). CLI scripts keep using `AppDataSource` directly; request-serving code
 * goes through `getDb()` so the connection is opened lazily, reused for the
 * lifetime of the process, and re-opened after a failed attempt.
 *
 * Node.js runtime only — never import this from Edge code.
 */

let initialization: Promise<DataSource> | undefined;

export function getDb(): Promise<DataSource> {
  if (AppDataSource.isInitialized) return Promise.resolve(AppDataSource);
  initialization ??= AppDataSource.initialize().catch((error: unknown) => {
    // Drop the failed attempt so the next caller (health check, request) retries.
    initialization = undefined;
    throw error;
  });
  return initialization;
}

export async function closeDb(): Promise<void> {
  initialization = undefined;
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
}
