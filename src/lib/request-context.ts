import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Request correlation (checklist §2 — "structured server logging with
 * request/correlation IDs").
 *
 * The correlation ID enters through the `x-request-id` header: `src/proxy.ts`
 * accepts a well-formed incoming id (so a proxy/CDN or a client can correlate)
 * or mints one, and forwards it to the route handler. The handler runs inside
 * `runWithRequestId`, so every log line emitted while serving that request can
 * pick the id up with `getLogger()` without threading it through every call.
 */

interface Store {
  requestId: string;
}

/** Ids we accept from outside: short, printable, never free-form text. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

const storage = new AsyncLocalStorage<Store>();

export const REQUEST_ID_HEADER = "x-request-id";

export function newRequestId(): string {
  return randomUUID();
}

/** Returns a safe incoming id, or `undefined` when absent/invalid. */
export function normalizeRequestId(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  const candidate = value.trim();
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : undefined;
}

/** Resolves the id for a request: reuse a valid incoming one, else mint one. */
export function resolveRequestId(value: string | null | undefined): string {
  return normalizeRequestId(value) ?? newRequestId();
}

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
