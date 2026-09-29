import Redis from "ioredis";

/**
 * The single Redis entry point for the application.
 *
 * Redis is strictly narrowly scoped (checklist §1): cache, rate limiting and
 * asynchronous jobs. It is NEVER the system of record — all business data lives
 * in PostgreSQL through TypeORM. Callers must treat Redis as optional and
 * define a safe fallback when it is unavailable.
 *
 * Connections are created lazily so that CLIs, tests and pages that do not
 * touch Redis never open one. Use `closeRedis()` in scripts/tests to release it.
 */

let client: Redis | undefined;

export function getRedis(): Redis {
  if (client) return client;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "Missing required environment variable REDIS_URL. Copy .env.example to .env and fill it in (or export it before running this command).",
    );
  }

  client = new Redis(url, {
    // Fail fast instead of queueing commands forever when Redis is down, so
    // callers can fall back to their safe default behaviour.
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });

  // Without a listener ioredis errors become uncaught exceptions. The logging
  // pipeline lands in checklist §2; until then surface the failure plainly.
  client.on("error", (error: Error) => {
    console.error(`[redis] ${error.message}`);
  });

  return client;
}

export async function connectRedis(): Promise<Redis> {
  const redis = getRedis();
  if (redis.status === "wait") await redis.connect();
  return redis;
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  await client.quit().catch(() => client?.disconnect());
  client = undefined;
}
