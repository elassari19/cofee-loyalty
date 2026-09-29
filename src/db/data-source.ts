import "reflect-metadata";
import path from "node:path";
import { DataSource } from "typeorm";

/**
 * TypeORM DataSource used by CLI scripts (migrations, seeds) and by server-side
 * code. It must only ever be used from the Node.js runtime — never from an
 * Edge runtime. Run all `pnpm db:*` scripts from the repository root.
 *
 * Entities are declared with `EntitySchema` (not decorators) so the same
 * modules load identically under Next.js (SWC), tsx (esbuild) and Vitest.
 * See docs/adr/0002-typeorm-entityschema.md.
 */

const rootDir = process.cwd();

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in (or export it before running this command).`,
    );
  }
  return value;
}

export const AppDataSource = new DataSource({
  type: "postgres",
  url: requiredEnv("DATABASE_URL"),
  entities: [path.join(rootDir, "src/db/entities/**/*.entity.{ts,js}")],
  migrations: [path.join(rootDir, "src/db/migrations/*.{ts,js}")],
  migrationsTableName: "migrations",
  // Schema synchronization is never used as a migration strategy; the schema
  // changes only through reviewed migration files (checklist §4).
  synchronize: false,
  migrationsRun: false,
  logging: process.env.LOG_LEVEL === "debug" ? ["error", "warn"] : ["error"],
});
