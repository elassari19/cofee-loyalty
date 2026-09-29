/**
 * Smoke test entry point: `pnpm smoke` (checklist §2 — "a minimal automated
 * smoke test for application startup and database connectivity").
 *
 * Verifies, in order and without needing a running web server:
 *   1. environment configuration is valid (fail fast, all problems listed);
 *   2. PostgreSQL is reachable and the migration state is known;
 *   3. Redis is reachable;
 *   4. `pnpm smoke -- --http` — a running server answers `GET /api/health`
 *      with 200 (used by CI after `pnpm build && pnpm start`).
 *
 * Exits non-zero on the first failed requirement, with an actionable message.
 */

import { scrubSecrets } from "../src/lib/logger";
import { validateEnv, type Env } from "../src/lib/env";

interface CheckResult {
  name: string;
  status: "ok" | "fail" | "skip";
  detail: string;
}

const results: CheckResult[] = [];

function record(result: CheckResult): void {
  results.push(result);
  const label =
    result.status === "ok"
      ? "[ok]  "
      : result.status === "fail"
        ? "[fail]"
        : "[skip]";
  console.log(`${label} ${result.name.padEnd(12)} ${result.detail}`);
}

function safeMessage(error: unknown): string {
  return scrubSecrets(error instanceof Error ? error.message : String(error));
}

async function checkEnvironment(): Promise<Env | undefined> {
  try {
    const env = validateEnv();
    record({
      name: "environment",
      status: "ok",
      detail: "configuration is valid",
    });
    return env;
  } catch (error) {
    record({
      name: "environment",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

async function checkPostgres(): Promise<void> {
  try {
    const { AppDataSource } = await import("../src/db/data-source");
    const startedAt = Date.now();
    await AppDataSource.initialize();
    try {
      await AppDataSource.query("select 1");

      const existsRows = await AppDataSource.query<Array<{ exists: boolean }>>(
        "select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'migrations') as exists",
      );
      const exists = existsRows[0]?.exists ?? false;
      const pending = await AppDataSource.showMigrations();

      if (!exists) {
        record({
          name: "postgres",
          status: "fail",
          detail: `reachable in ${Date.now() - startedAt}ms but no migrations table — run \`pnpm db:migrate\``,
        });
        return;
      }

      const countRows = await AppDataSource.query<Array<{ count: string }>>(
        "select count(*)::text as count from migrations",
      );
      const count = countRows[0]?.count ?? "0";
      record({
        name: "postgres",
        status: pending ? "fail" : "ok",
        detail:
          `reachable in ${Date.now() - startedAt}ms — ${count} migration(s) applied` +
          (pending ? ", migrations pending — run `pnpm db:migrate`" : ""),
      });
    } finally {
      await AppDataSource.destroy();
    }
  } catch (error) {
    record({
      name: "postgres",
      status: "fail",
      detail: `${safeMessage(error)} — start it with \`pnpm services:up\``,
    });
  }
}

async function checkRedis(): Promise<void> {
  try {
    const { connectRedis, closeRedis } = await import("../src/lib/redis");
    try {
      const startedAt = Date.now();
      const redis = await connectRedis();
      await redis.ping();
      record({
        name: "redis",
        status: "ok",
        detail: `reachable in ${Date.now() - startedAt}ms`,
      });
    } finally {
      await closeRedis();
    }
  } catch (error) {
    record({
      name: "redis",
      status: "fail",
      detail: `${safeMessage(error)} — start it with \`pnpm services:up\``,
    });
  }
}

const HTTP_TIMEOUT_MS = 5_000;
const HTTP_WAIT_MS = 30_000;

async function checkHttp(env: Env): Promise<void> {
  const url = `${env.APP_URL}/api/health`;
  const deadline = Date.now() + HTTP_WAIT_MS;
  let lastError = "server did not answer";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      const body = (await response.json()) as {
        status?: string;
        checks?: Record<string, { status?: string }>;
      };
      if (response.status === 200 && body.status === "ok") {
        record({
          name: "http",
          status: "ok",
          detail: `GET ${url} → 200 (app, postgres, redis healthy)`,
        });
        return;
      }
      const failing = Object.entries(body.checks ?? {})
        .filter(([, check]) => check.status !== "ok")
        .map(([name]) => name);
      lastError =
        `GET ${url} → ${response.status}` +
        (failing.length ? ` (${failing.join(", ")} unhealthy)` : "");
      break;
    } catch (error) {
      lastError = safeMessage(error);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  record({
    name: "http",
    status: "fail",
    detail: `${lastError} — start the server with \`pnpm dev\` or \`pnpm build && pnpm start\``,
  });
}

async function main(): Promise<void> {
  console.log("loyalty-saas smoke test\n");

  const env = await checkEnvironment();
  if (!env) {
    finish(1);
    return;
  }

  await checkPostgres();
  await checkRedis();

  if (process.argv.includes("--http")) {
    await checkHttp(env);
  } else {
    record({
      name: "http",
      status: "skip",
      detail: "not requested — pass `-- --http` to check a running server",
    });
  }

  finish(results.filter((result) => result.status === "fail").length);
}

function finish(failures: number): void {
  console.log(
    failures === 0
      ? "\nAll smoke checks passed."
      : `\n${failures} smoke check(s) failed.`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(`\n[fail] smoke test crashed: ${safeMessage(error)}`);
  process.exitCode = 1;
});
