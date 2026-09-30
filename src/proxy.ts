import { NextResponse, type NextRequest } from "next/server";
import { getLogger } from "@/lib/logger";
import {
  PATHNAME_HEADER,
  REQUEST_ID_HEADER,
  resolveRequestId,
} from "@/lib/request-context";

/**
 * Correlation-id entry point (checklist §2).
 *
 * Next.js 16 calls this file before every matched request. Proxy runs in its
 * own invocation, so the id is propagated to the rest of the server through the
 * `x-request-id` request header rather than through shared state; route
 * handlers wrapped in `withApiHandler` pick it up and bind it to their logs.
 * The id is echoed back on the response so a browser or API client can quote it
 * in a bug report.
 */
export function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  // Tells the page guards where the visitor actually asked to go, so a sign-in
  // redirect can carry `?next=` and return them there afterwards.
  requestHeaders.set(
    PATHNAME_HEADER,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(REQUEST_ID_HEADER, requestId);

  getLogger().info(
    { requestId, method: request.method, path: request.nextUrl.pathname },
    "request received",
  );

  return response;
}

export const config = {
  // Static assets and framework internals do not need a correlation id.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
