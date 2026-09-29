import {
  pino,
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from "pino";
import { getRequestId } from "./request-context";

/**
 * Structured server logging (checklist §2).
 *
 * Every server-side log line is JSON with the same shape so it can be shipped to
 * any aggregator. Secrets and personal data are redacted centrally here rather
 * than at each call site: callers log business events, never credentials.
 *
 *   import { getLogger } from "@/lib/logger";
 *   getLogger().info({ merchantId }, "loyalty program updated");
 *
 * `getLogger()` additionally binds the current request's correlation id when
 * called inside a request, so logs can be joined across the proxy, the handler
 * and background work.
 */

const LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
];

export const REDACTED = "[REDACTED]";

/**
 * Keys whose values must never reach a log aggregator. Wildcards cover both
 * top-level (`{ password }`) and nested (`{ body: { password } }`) usage.
 * Redaction runs inside pino, before serialisation, so nothing leaks through
 * message templates either.
 */
export const redactionPaths: string[] = [
  // credentials
  "password",
  "*.password",
  "newPassword",
  "*.newPassword",
  "currentPassword",
  "*.currentPassword",
  "passwordConfirmation",
  "*.passwordConfirmation",
  "passwordHash",
  "*.passwordHash",
  // tokens, keys and session material
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "sessionToken",
  "*.sessionToken",
  "secret",
  "*.secret",
  "apiKey",
  "*.apiKey",
  "authorization",
  "*.authorization",
  "cookie",
  "*.cookie",
  "cookies",
  "*.cookies",
  "setCookie",
  "*.setCookie",
  // loyalty verification material (checklist §2: redemption codes)
  "redemptionCode",
  "*.redemptionCode",
  "verificationCode",
  "*.verificationCode",
  "qrToken",
  "*.qrToken",
  "otp",
  "*.otp",
  // personal data
  "email",
  "*.email",
  "emailAddress",
  "*.emailAddress",
  "phone",
  "*.phone",
  "phoneNumber",
  "*.phoneNumber",
  "firstName",
  "*.firstName",
  "lastName",
  "*.lastName",
  "fullName",
  "*.fullName",
  "dateOfBirth",
  "*.dateOfBirth",
];

/**
 * Removes credentials embedded in free-form text — driver and framework errors
 * sometimes interpolate the whole connection string into `message`.
 */
export function scrubSecrets(value: string): string {
  return value
    .replace(
      /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi,
      "$1" + REDACTED + "@",
    )
    .replace(/\b(password|secret|token)=([^\s&;]+)/gi, `$1=${REDACTED}`);
}

/** Keeps stacks for operators while scrubbing anything credential-shaped. */
export function serializeError(value: unknown): Record<string, unknown> {
  if (value instanceof Error) {
    return {
      type: value.name,
      message: scrubSecrets(value.message),
      code: "code" in value ? (value as { code?: string }).code : undefined,
      stack: value.stack ? scrubSecrets(value.stack) : undefined,
    };
  }
  return { message: scrubSecrets(String(value)) };
}

function resolveLevel(): string {
  const level = process.env.LOG_LEVEL;
  return level && LOG_LEVELS.includes(level) ? level : "info";
}

export function buildLoggerOptions(
  overrides: LoggerOptions = {},
): LoggerOptions {
  return {
    level: resolveLevel(),
    base: {
      app: "loyalty-saas",
      env: process.env.NODE_ENV,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: redactionPaths, censor: REDACTED },
    serializers: {
      err: serializeError,
      error: serializeError,
    },
    ...overrides,
  };
}

/** Creates an isolated logger — used by tests and CLI entry points. */
export function createLogger(
  overrides: LoggerOptions = {},
  destination?: DestinationStream,
): Logger {
  return destination
    ? pino(buildLoggerOptions(overrides), destination)
    : pino(buildLoggerOptions(overrides));
}

/** The process-wide logger. */
export const logger: Logger = createLogger();

/**
 * Logger for the current execution context: binds the request correlation id
 * when there is one, so every line can be joined with the originating request.
 */
export function getLogger(): Logger {
  const requestId = getRequestId();
  return requestId ? logger.child({ requestId }) : logger;
}
