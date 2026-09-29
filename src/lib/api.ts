import { NextResponse, type NextRequest } from "next/server";
import {
  AppError,
  RateLimitError,
  toAppError,
  type ApiErrorCode,
  type FieldIssue,
} from "./errors";
import { getLogger } from "./logger";
import {
  REQUEST_ID_HEADER,
  resolveRequestId,
  runWithRequestId,
} from "./request-context";

/**
 * Route handler wrapper (checklist §2 — centralized error handling).
 *
 *   export const GET = withApiHandler(async (request) => { ... });
 *
 * It guarantees three things for every API route:
 *   1. the request runs under a correlation id, so its logs can be joined;
 *   2. a thrown `AppError` becomes the standard JSON error envelope;
 *   3. anything else becomes an opaque 500 — stack traces, SQL and driver
 *      messages stay in the server logs, never in the response.
 */

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    issues?: FieldIssue[];
  };
}

export type ApiHandler<Context = unknown> = (
  request: NextRequest,
  context: Context,
) => Promise<Response> | Response;

/** Builds the safe, consistent error envelope. */
export function errorResponse(
  error: AppError,
  requestId: string,
): NextResponse {
  const body: ApiErrorBody = {
    error: {
      code: error.code,
      message: error.expose
        ? error.message
        : "An unexpected error occurred. Please try again.",
      requestId,
      ...(error.issues && error.issues.length > 0
        ? { issues: error.issues }
        : {}),
    },
  };

  const headers = new Headers({ [REQUEST_ID_HEADER]: requestId });
  if (error instanceof RateLimitError && error.retryAfterSeconds) {
    headers.set("retry-after", String(error.retryAfterSeconds));
  }

  return NextResponse.json(body, { status: error.status, headers });
}

export function withApiHandler<Context = unknown>(
  handler: ApiHandler<Context>,
): ApiHandler<Context> {
  return async (request, context) => {
    const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
    const startedAt = Date.now();
    const method = request.method;
    const path = request.nextUrl.pathname;

    // The whole request — handler plus its logging — runs inside the
    // correlation context so every line carries the same id.
    return runWithRequestId(requestId, async () => {
      try {
        const response = await handler(request, context);
        if (!response.headers.get(REQUEST_ID_HEADER)) {
          response.headers.set(REQUEST_ID_HEADER, requestId);
        }
        getLogger().info(
          {
            method,
            path,
            status: response.status,
            durationMs: Date.now() - startedAt,
          },
          "request completed",
        );
        return response;
      } catch (unknownError) {
        const error = toAppError(unknownError);
        const logPayload = {
          // The original cause keeps its own stack; AppErrors point at the throw.
          err: error.cause ?? unknownError,
          code: error.code,
          status: error.status,
          method,
          path,
          durationMs: Date.now() - startedAt,
        };
        if (error.status >= 500) {
          getLogger().error(logPayload, "request failed");
        } else {
          getLogger().warn(logPayload, "request rejected");
        }
        return errorResponse(error, requestId);
      }
    });
  };
}
