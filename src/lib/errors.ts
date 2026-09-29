import { ZodError } from "zod";

/**
 * Centralized API error model (checklist §2 — "returns safe, consistent API
 * errors without exposing stack traces or SQL details").
 *
 * Throw an `AppError` subclass from anywhere in the server code; the
 * `withApiHandler` wrapper converts it into the standard response envelope.
 * Anything that is not an `AppError` becomes an opaque 500: the original error
 * is logged server-side with its stack, the caller only ever sees a generic
 * message.
 */

export type ApiErrorCode =
  | "bad_request"
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "service_unavailable"
  | "internal_error";

/** Field-level validation issue, safe to return to the caller. */
export interface FieldIssue {
  path: string;
  message: string;
}

export interface AppErrorOptions {
  code: ApiErrorCode;
  status: number;
  /** Field issues for validation failures. */
  issues?: FieldIssue[];
  /** Whether `message` may be shown to the caller (default: 4xx are safe). */
  expose?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly issues?: FieldIssue[];
  readonly expose: boolean;

  constructor(message: string, options: AppErrorOptions) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.status = options.status;
    this.issues = options.issues;
    this.expose = options.expose ?? options.status < 500;
  }
}

export class BadRequestError extends AppError {
  constructor(
    message = "The request could not be processed.",
    cause?: unknown,
  ) {
    super(message, { code: "bad_request", status: 400, cause });
  }
}

export class ValidationError extends AppError {
  constructor(
    issues: FieldIssue[],
    message = "The submitted data is invalid.",
  ) {
    super(message, { code: "validation_error", status: 400, issues });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication is required.", cause?: unknown) {
    super(message, { code: "unauthorized", status: 401, cause });
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = "You do not have permission to do this.",
    cause?: unknown,
  ) {
    super(message, { code: "forbidden", status: 403, cause });
  }
}

export class NotFoundError extends AppError {
  constructor(
    message = "The requested resource was not found.",
    cause?: unknown,
  ) {
    super(message, { code: "not_found", status: 404, cause });
  }
}

export class ConflictError extends AppError {
  constructor(
    message = "The request conflicts with the current state.",
    cause?: unknown,
  ) {
    super(message, { code: "conflict", status: 409, cause });
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds?: number;

  constructor(
    message = "Too many requests. Please try again shortly.",
    retryAfterSeconds?: number,
  ) {
    super(message, { code: "rate_limited", status: 429 });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(
    message = "A required service is temporarily unavailable.",
    cause?: unknown,
  ) {
    super(message, { code: "service_unavailable", status: 503, cause });
  }
}

export class InternalError extends AppError {
  constructor(cause?: unknown) {
    super("An unexpected error occurred.", {
      code: "internal_error",
      status: 500,
      expose: false,
      cause,
    });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

function zodIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join(".") || "(root)",
    message: issue.message,
  }));
}

/**
 * Normalises anything thrown on the server into an `AppError`.
 * Unknown errors are deliberately opaque — their detail goes to the logs only.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof ZodError) return new ValidationError(zodIssues(error));
  return new InternalError(error);
}
