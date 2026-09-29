import { getDb } from "@/db/connection";
import { getLogger } from "@/lib/logger";
import { connectRedis } from "@/lib/redis";

/**
 * Health checks for the application, PostgreSQL and Redis (checklist §2).
 *
 * Each dependency is probed independently with a hard timeout so a dead service
 * produces a clear, fast answer instead of a hanging request. Failure messages
 * returned to the caller are generic; the underlying error (which may contain
 * connection details) is written to the structured logs under the same
 * correlation id.
 */

export type CheckStatus = "ok" | "down";

export interface HealthCheck {
  status: CheckStatus;
  latencyMs: number;
  /** Safe, generic explanation — never connection strings or driver detail. */
  message?: string;
  details?: Record<string, string>;
}

export interface HealthReport {
  status: "ok" | "unhealthy";
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    app: HealthCheck;
    postgres: HealthCheck;
    redis: HealthCheck;
  };
}

const CHECK_TIMEOUT_MS = 2_500;

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${CHECK_TIMEOUT_MS}ms`)),
      CHECK_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkApp(): Promise<HealthCheck> {
  return {
    status: "ok",
    latencyMs: 0,
    details: { node: process.version, runtime: "nodejs" },
  };
}

export async function checkDatabase(): Promise<HealthCheck> {
  const startedAt = Date.now();
  try {
    const db = await withTimeout(getDb(), "postgres connect");
    await withTimeout(db.query("select 1"), "postgres query");
    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch (error) {
    getLogger().warn({ err: error }, "health check failed: postgres");
    return {
      status: "down",
      latencyMs: Date.now() - startedAt,
      message: "PostgreSQL is unreachable. Start it with `pnpm services:up`.",
    };
  }
}

export async function checkRedis(): Promise<HealthCheck> {
  const startedAt = Date.now();
  try {
    const redis = await withTimeout(connectRedis(), "redis connect");
    await withTimeout(redis.ping(), "redis ping");
    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch (error) {
    getLogger().warn({ err: error }, "health check failed: redis");
    return {
      status: "down",
      latencyMs: Date.now() - startedAt,
      message: "Redis is unreachable. Start it with `pnpm services:up`.",
    };
  }
}

export async function getHealthReport(): Promise<HealthReport> {
  const [app, postgres, redis] = await Promise.all([
    checkApp(),
    checkDatabase(),
    checkRedis(),
  ]);

  const checks = { app, postgres, redis };
  const healthy = Object.values(checks).every((check) => check.status === "ok");

  return {
    status: healthy ? "ok" : "unhealthy",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    checks,
  };
}
