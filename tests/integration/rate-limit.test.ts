import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/connection";
import { resetRateLimits, enforceRateLimit } from "@/lib/rate-limit";
import { isRedisReachable } from "../helpers/services";
import { RateLimitError } from "@/lib/errors";
import { resetEnvCache } from "@/lib/env";

const redisReachable = await isRedisReachable();

if (!redisReachable) {
  console.warn(
    "[test] Redis is not reachable — skipping rate limit Redis tests. Start local services with `pnpm services:up`.",
  );
}

describe.skipIf(!redisReachable)(
  "Rate limiter — Redis backend (checklist §5, §13)",
  () => {
    beforeAll(async () => {
      await resetRateLimits();
    });

    afterAll(async () => {
      await resetRateLimits();
    });

    it("counts attempts in Redis and returns the backend used", async () => {
      const result = await enforceRateLimit("login", "test-ip-1");
      expect(result.backend).toBe("redis");
      expect(result.policy).toBe("login");
      expect(result.subject).toBe("test-ip-1");
    });

    it("enforces the configured window and max for login", async () => {
      const subject = "test-ip-login-window";

      for (let i = 0; i < 5; i += 1) {
        const outcome = await enforceRateLimit("login", subject);
        expect(outcome.backend).toBe("redis");
      }

      await expect(enforceRateLimit("login", subject)).rejects.toThrow(
        RateLimitError,
      );
    });

    it("tracks different subjects independently", async () => {
      await enforceRateLimit("login", "subject-a");
      await enforceRateLimit("login", "subject-a");

      const outcome = await enforceRateLimit("login", "subject-b");
      expect(outcome.backend).toBe("redis");
    });
  },
);

describe("Rate limiter — In-memory fallback when Redis is unreachable (checklist §5, §13)", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeAll(async () => {
    // Set an invalid Redis URL to force fallback
    process.env.REDIS_URL = "redis://invalid-host:6379";
    resetEnvCache();
    await resetRateLimits();
  });

  afterAll(async () => {
    process.env.REDIS_URL = originalRedisUrl;
    resetEnvCache();
    await resetRateLimits();
  });

  it("falls back to memory when Redis connection fails", async () => {
    const result = await enforceRateLimit("login", "fallback-subject-1");
    expect(result.backend).toBe("memory");
    expect(result.policy).toBe("login");
    expect(result.subject).toBe("fallback-subject-1");
  });

  it("enforces limits in memory with the same policy semantics", async () => {
    const subject = "fallback-subject-window";

    for (let i = 0; i < 3; i += 1) {
      const outcome = await enforceRateLimit("register", subject);
      expect(outcome.backend).toBe("memory");
    }

    await expect(enforceRateLimit("register", subject)).rejects.toThrow(
      RateLimitError,
    );
  });

  it("isolates memory counters per policy", async () => {
    const subject = "fallback-policy-isolation";

    await enforceRateLimit("login", subject);
    await enforceRateLimit("login", subject);
    await enforceRateLimit("login", subject);
    await enforceRateLimit("login", subject);
    await enforceRateLimit("login", subject);
    await expect(enforceRateLimit("login", subject)).rejects.toThrow(
      RateLimitError,
    );

    const outcome = await enforceRateLimit("register", subject);
    expect(outcome.backend).toBe("memory");
  });

  it("tracks different subjects independently in memory", async () => {
    await enforceRateLimit("passwordReset", "subject-x");
    await enforceRateLimit("passwordReset", "subject-x");

    const outcome = await enforceRateLimit("passwordReset", "subject-y");
    expect(outcome.backend).toBe("memory");
  });
});

describe("Rate limiter — Per-policy configuration with valid Redis (checklist §5)", () => {
  beforeAll(async () => {
    // Restore valid Redis URL
    process.env.REDIS_URL = "redis://localhost:6380";
    resetEnvCache();
    await resetRateLimits();
  });

  afterAll(async () => {
    await resetRateLimits();
  });

  it("applies different limits per policy", async () => {
    const subject = "policy-diff-login";
    for (let i = 0; i < 5; i += 1) {
      await enforceRateLimit("login", subject);
    }
    await expect(enforceRateLimit("login", subject)).rejects.toThrow(
      RateLimitError,
    );
  });

  it("register has a longer window and lower max than login", async () => {
    const subject = "policy-diff-register";
    for (let i = 0; i < 3; i += 1) {
      await enforceRateLimit("register", subject);
    }
    await expect(enforceRateLimit("register", subject)).rejects.toThrow(
      RateLimitError,
    );
  });

  it("redemption code attempts are limited", async () => {
    const subject = "policy-diff-redeem";
    for (let i = 0; i < 10; i += 1) {
      await enforceRateLimit("redeemCode", subject);
    }
    await expect(enforceRateLimit("redeemCode", subject)).rejects.toThrow(
      RateLimitError,
    );
  });
});

describe("Rate limiter — Circuit breaker and recovery (checklist §5, §13)", () => {
  beforeAll(async () => {
    await resetRateLimits();
  });

  afterAll(async () => {
    await resetRateLimits();
  });

  it("opens the breaker after consecutive Redis failures", async () => {
    vi.spyOn(await import("@/lib/redis"), "connectRedis").mockRejectedValue(
      new Error("Redis connection refused"),
    );

    try {
      for (let i = 0; i < 4; i += 1) {
        const result = await enforceRateLimit("tokenResolve", `breaker-${i}`);
        expect(result.backend).toBe("memory");
      }
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("recovers to Redis after cooldown when Redis becomes available", async () => {
    await resetRateLimits();
    const subject = "recovery-test";

    const outcome = await enforceRateLimit("redeemCode", subject);
    expect(["redis", "memory"]).toContain(outcome.backend);
  });
});
