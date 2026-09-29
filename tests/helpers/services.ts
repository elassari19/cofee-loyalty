import { Client } from "pg";
import Redis from "ioredis";

/**
 * Small reachability probes used by the tests to decide whether the optional
 * integration suites should run. They never throw: an unreachable service
 * simply reports `false` so the suite can skip with an actionable message.
 */

export async function isPostgresReachable(
  connectionString: string | undefined = process.env.DATABASE_URL,
  timeoutMs = 2_000,
): Promise<boolean> {
  if (!connectionString) return false;
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: timeoutMs,
  });
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function isRedisReachable(
  url: string | undefined = process.env.REDIS_URL,
  timeoutMs = 2_000,
): Promise<boolean> {
  if (!url) return false;
  const client = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    await Promise.race([
      client.connect().then(() => client.ping()),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("redis probe timed out")), timeoutMs),
      ),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    client.disconnect();
  }
}
