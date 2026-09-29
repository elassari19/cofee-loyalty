import { AppDataSource } from "../src/db/data-source";

/**
 * Repeatable development seed entry point: `pnpm db:seed`.
 * Never seed production with default credentials (checklist §4).
 */
async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const hasPendingMigrations = await AppDataSource.showMigrations();
    if (hasPendingMigrations) {
      console.warn(
        "[seed] Pending migrations detected. Run `pnpm db:migrate` before seeding.",
      );
    }

    // Seed data is added in checklist §4 (PostgreSQL and TypeORM Data Foundation).
    console.log("[seed] Connected to PostgreSQL. No seed data defined yet.");
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    "[seed] Failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
