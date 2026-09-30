import { getAuth } from "@/auth/config";
import { withApiHandler } from "@/lib/api";
import { recordAudit, type AuditAction } from "@/lib/audit";
import { getLogger } from "@/lib/logger";
import { authPolicyForPath, enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

/**
 * Better Auth's HTTP surface (checklist §5 — "Apply rate limits to login,
 * registration, password reset, QR/token resolution, and redemption-code
 * attempts"; ADR 0001).
 *
 * The wrapper does three things the library does not:
 *   1. counts the attempt against the policy for the endpoint (per client
 *      address) and answers 429 + `retry-after` when the window is spent —
 *      including when Redis is down, via the in-memory fallback;
 *   2. records the outcome in the audit trail: a successful sign-in, a failed
 *      one, registration, sign-out, password reset and e-mail verification;
 *   3. runs everything under the shared correlation id, so an auth failure
 *      lines up with the rest of the request logs.
 *
 * Rate limiting happens *before* the handler: a caller who is over the limit
 * never reaches password verification.
 */

export const dynamic = "force-dynamic";

const AUDITABLE: Array<{
  match: (path: string, method: string) => boolean;
  action: AuditAction;
  resource: string;
  /** Recorded instead of `action` when the response says it did not happen. */
  failureAction?: AuditAction;
  succeeded: (status: number) => boolean;
}> = [
  {
    match: (path, method) => method === "POST" && path.includes("/sign-in/"),
    action: "auth.login",
    failureAction: "auth.login_failed",
    resource: "user",
    succeeded: (status) => status >= 200 && status < 300,
  },
  {
    match: (path, method) => method === "POST" && path.includes("/sign-up/"),
    action: "auth.registered",
    resource: "user",
    succeeded: (status) => status >= 200 && status < 300,
  },
  {
    match: (path, method) => method === "POST" && path.includes("/sign-out"),
    action: "auth.logout",
    resource: "user",
    succeeded: (status) => status >= 200 && status < 300,
  },
  {
    match: (path, method) =>
      method === "POST" && path.includes("/request-password-reset"),
    action: "auth.password_reset_requested",
    resource: "user",
    succeeded: (status) => status >= 200 && status < 300,
  },
  {
    match: (path, method) =>
      method === "POST" && path.includes("/reset-password"),
    action: "auth.password_reset_completed",
    resource: "user",
    succeeded: (status) => status >= 200 && status < 300,
  },
  {
    match: (path, method) => method === "GET" && path.includes("/verify-email"),
    action: "auth.email_verified",
    resource: "user",
    succeeded: (status) => status >= 200 && status < 300,
  },
];

function auditAuthOutcome(
  path: string,
  method: string,
  status: number,
  ip: string,
): void {
  for (const entry of AUDITABLE) {
    if (!entry.match(path, method)) continue;
    const ok = entry.succeeded(status);
    const action = ok ? entry.action : entry.failureAction;
    // Only entries that declare a failure action record rejected attempts.
    if (!action) return;
    void recordAudit({
      action,
      resource: entry.resource,
      ipAddress: ip,
      metadata: { path, status, method },
    });
    return;
  }
}

const handler = withApiHandler(async (request) => {
  const ip = clientIp(request.headers);
  const path = request.nextUrl.pathname;

  await enforceRateLimit(authPolicyForPath(path), ip);

  const auth = getAuth();
  const response = await auth.handler(request);

  auditAuthOutcome(path, request.method, response.status, ip);
  if (response.status === 401 || response.status === 400) {
    getLogger().debug(
      { path, status: response.status },
      "authentication request rejected",
    );
  }
  return response;
});

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
