import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api";
import { getHealthReport } from "@/lib/health";

/**
 * Liveness/readiness style health endpoint for local development, Docker
 * healthchecks, CI and production monitoring (checklist §2).
 *
 *   GET /api/health        → 200 { status: "ok", ... } when app + PostgreSQL +
 *                            Redis are all reachable, otherwise 503 with the
 *                            failing checks named.
 *
 * Never caches, never exposes connection strings or driver errors.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiHandler(async () => {
  const report = await getHealthReport();
  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
});
