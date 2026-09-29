import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { REQUEST_ID_HEADER } from "@/lib/request-context";

/**
 * Minimal application startup smoke test (checklist §2): the health route —
 * and everything it pulls in (environment, logger, PostgreSQL and Redis
 * adapters) — must load and answer with a well-formed report.
 */

interface HealthBody {
  status: "ok" | "unhealthy";
  timestamp: string;
  uptimeSeconds: number;
  checks: Record<string, { status: "ok" | "down"; latencyMs: number }>;
}

describe("GET /api/health", () => {
  it("answers with a complete, safe health report", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/health"),
      undefined,
    );
    const raw = await response.text();
    const body = JSON.parse(raw) as HealthBody;

    expect([200, 503]).toContain(response.status);
    expect(Object.keys(body.checks).sort()).toEqual([
      "app",
      "postgres",
      "redis",
    ]);
    expect(body.checks.app?.status).toBe("ok");
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);

    if (response.status === 200) {
      expect(body.status).toBe("ok");
      expect(body.checks.postgres?.status).toBe("ok");
      expect(body.checks.redis?.status).toBe("ok");
    } else {
      expect(body.status).toBe("unhealthy");
      expect(
        Object.values(body.checks).some((check) => check.status === "down"),
      ).toBe(true);
    }

    expect(response.headers.get(REQUEST_ID_HEADER)).toBeTruthy();
    expect(response.headers.get("cache-control")).toBe("no-store");

    // The report must never expose connection strings or credentials.
    expect(raw).not.toContain("postgresql://");
    expect(raw).not.toContain("redis://");
    expect(raw).not.toContain("password");
  });
});
