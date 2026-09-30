import {
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
} from "rate-limiter-flexible";

import { getEnv } from "./env";
import { RateLimitError } from "./errors";
import { getLogger } from "./logger";

/**
 * Abuse-resistant limits for the sensitive endpoints (checklist §5).
 *
 * - One policy per *kind* of abuse, configured through the environment
 *   (`.env.example`): `login`, `register`, `passwordReset`, `tokenResolve`
 *   (QR payload / verification / reset token lookups) and `redeemCode`.
 * - Redis is the counter store so limits hold across instances, but Redis is
 *   strictly optional: a store failure or a missing `REDIS_URL` switches the
 *   process to an in-memory limiter of the same shape — the limit degrades to
 *   per-instance instead of disappearing or taking the endpoint down. A
 *   circuit breaker stops a dead Redis from adding latency to every request.
 * - Exceeding a limit throws `RateLimitError` (429 + `retry-after`), which the
 *   shared API wrapper turns into the standard error envelope.
 */

export type RateLimitPolicy =
  "login" | "register" | "passwordReset" | "tokenResolve" | "redeemCode";

interface PolicySettings {
  max: number;
  windowSeconds: number;
}

export function policySettings(policy: RateLimitPolicy): PolicySettings {
  const env = getEnv();
  switch (policy) {
    case "login":
      return {
        max: env.RATE_LIMIT_LOGIN_MAX,
        windowSeconds: env.RATE_LIMIT_LOGIN_WINDOW_SECONDS,
      };
    case "register":
      return {
        max: env.RATE_LIMIT_REGISTER_MAX,
        windowSeconds: env.RATE_LIMIT_REGISTER_WINDOW_SECONDS,
      };
    case "passwordReset":
      return {
        max: env.RATE_LIMIT_PASSWORD_RESET_MAX,
        windowSeconds: env.RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS,
      };
    case "tokenResolve":
      return {
        max: env.RATE_LIMIT_TOKEN_RESOLVE_MAX,
        windowSeconds: env.RATE_LIMIT_TOKEN_RESOLVE_WINDOW_SECONDS,
      };
    case "redeemCode":
      return {
        max: env.RATE_LIMIT_REDEMPTION_MAX,
        windowSeconds: env.RATE_LIMIT_REDEMPTION_WINDOW_SECONDS,
      };
  }
}

interface Limiter {
  consume(key: string, points?: number): Promise<RateLimiterRes>;
}

const memoryLimiters = new Map<RateLimitPolicy, RateLimiterMemory>();
const redisLimiters = new Map<RateLimitPolicy, RateLimiterRedis>();

/** Consecutive Redis store failures before the breaker opens. */
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 15_000;
let redisFailures = 0;
let breakerOpenUntil = 0;

function memoryLimiter(policy: RateLimitPolicy): RateLimiterMemory {
  let limiter = memoryLimiters.get(policy);
  if (!limiter) {
    const { max, windowSeconds } = policySettings(policy);
    limiter = new RateLimiterMemory({ points: max, duration: windowSeconds });
    memoryLimiters.set(policy, limiter);
  }
  return limiter;
}

function noteStoreFailure(policy: RateLimitPolicy, error: unknown): void {
  redisFailures += 1;
  if (redisFailures === BREAKER_THRESHOLD) {
    breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
    getLogger().warn(
      { policy, cooldownMs: BREAKER_COOLDOWN_MS },
      "rate limiter redis unavailable — using in-memory fallback",
    );
  }
  if (redisFailures >= BREAKER_THRESHOLD && Date.now() > breakerOpenUntil) {
    // Half-open: let the next attempt probe Redis again.
    breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
  }
  getLogger().debug(
    { policy, err: error instanceof Error ? error : undefined },
    "rate limiter store call failed",
  );
}

async function redisLimiter(
  policy: RateLimitPolicy,
): Promise<RateLimiterRedis | null> {
  if (!process.env.REDIS_URL) return null;
  if (Date.now() < breakerOpenUntil) return null;

  let limiter = redisLimiters.get(policy);
  if (limiter) return limiter;

  try {
    const { connectRedis } = await import("./redis");
    const client = await connectRedis();
    const { max, windowSeconds } = policySettings(policy);
    limiter = new RateLimiterRedis({
      storeClient: client,
      keyPrefix: `rl:${policy}:`,
      points: max,
      duration: windowSeconds,
    });
    redisLimiters.set(policy, limiter);
    return limiter;
  } catch (error) {
    noteStoreFailure(policy, error);
    return null;
  }
}

function isRateLimiterRejection(error: unknown): error is RateLimiterRes {
  return error instanceof RateLimiterRes;
}

async function consume(
  limiter: Limiter,
  policy: RateLimitPolicy,
  subject: string,
): Promise<void> {
  try {
    await limiter.consume(subject);
  } catch (error) {
    if (isRateLimiterRejection(error)) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(error.msBeforeNext / 1000),
      );
      throw new RateLimitError(
        "Too many attempts. Please wait a moment and try again.",
        retryAfterSeconds,
      );
    }
    throw error;
  }
}

export interface RateLimitOutcome {
  policy: RateLimitPolicy;
  subject: string;
  backend: "redis" | "memory";
}

/**
 * Counts one attempt against `policy`. Throws `RateLimitError` (429) once the
 * caller exhausts the window.
 *
 * `subject` is what the window is counted per — the client address for
 * unauthenticated flows, `${ip}|${email}` where a shared address must not let
 * one caller lock others out.
 */
export async function enforceRateLimit(
  policy: RateLimitPolicy,
  subject: string,
): Promise<RateLimitOutcome> {
  const redis = await redisLimiter(policy);
  if (redis) {
    try {
      await consume(redis, policy, subject);
      redisFailures = 0;
      breakerOpenUntil = 0;
      return { policy, subject, backend: "redis" };
    } catch (error) {
      // A real rejection is already a `RateLimitError` — only store failures
      // fall through to the in-memory limiter.
      if (error instanceof RateLimitError) throw error;
      noteStoreFailure(policy, error);
    }
  }

  await consume(memoryLimiter(policy), policy, subject);
  return { policy, subject, backend: "memory" };
}

/**
 * Test helper: forget every counter and close the circuit breaker.
 *
 * Clears both stores — the in-memory limiters *and* the Redis keys they are
 * mirrored into — so a suite can start from a clean window even when Redis
 * outlives the process that filled it.
 */
export async function resetRateLimits(): Promise<void> {
  memoryLimiters.clear();
  redisLimiters.clear();
  redisFailures = 0;
  breakerOpenUntil = 0;
  if (!process.env.REDIS_URL) return;
  try {
    const { connectRedis } = await import("./redis");
    const client = await connectRedis();
    const keys = await client.keys("rl:*");
    if (keys.length > 0) await client.del(keys);
  } catch {
    // Nothing to clear: the limiter already fell back to memory.
  }
}

/**
 * Which policy an authentication endpoint belongs to. Used by the `/api/auth/*`
 * wrapper so the limits above apply to the real HTTP surface rather than to
 * each caller individually.
 */
export function authPolicyForPath(pathname: string): RateLimitPolicy {
  const path = pathname.toLowerCase();
  if (path.includes("/sign-in/")) return "login";
  if (path.includes("/sign-up/")) return "register";
  if (path.includes("password-reset") || path.includes("/reset-password")) {
    return "passwordReset";
  }
  return "tokenResolve";
}
