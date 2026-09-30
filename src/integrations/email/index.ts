import { getLogger } from "@/lib/logger";

/**
 * Provider-neutral outbound email (checklist §5 password reset / email
 * verification, checklist §12 "Keep external providers behind adapters").
 *
 * Phase 1 ships no provider: messages are handed to the configured
 * `EmailProvider`, which defaults to a local capture adapter. Swapping in a real
 * provider later is a one-line `setEmailProvider(...)` — the auth flows never
 * learn which vendor sends the message.
 *
 * **Nothing here is ever logged.** Reset and verification links embed single-use
 * tokens, so the message body only ever lives in the outbox (non-production
 * capture, test assertions) and in the provider that delivers it.
 */

export type AuthEmailKind = "password-reset" | "email-verification";

export interface AuthEmailMessage {
  kind: AuthEmailKind;
  to: string;
  subject: string;
  /** Plain-text body containing the single-use link. Never logged. */
  text: string;
  /** The action link, kept structured so callers do not parse `text`. */
  link: string;
}

export type EmailProvider = (message: AuthEmailMessage) => Promise<void>;

/**
 * Bounded capture of recent messages — local dev and automated tests only.
 *
 * Kept on `globalThis` so every copy of this module (route handlers, server
 * actions, hot-reloaded bundles) reads the same inbox: capturing in one
 * module graph and listing from another must not show an empty outbox.
 */
const OUTBOX_LIMIT = 50;
const globalScope = globalThis as typeof globalThis & {
  __loyaltyAuthOutbox?: AuthEmailMessage[];
};
const outbox: AuthEmailMessage[] = (globalScope.__loyaltyAuthOutbox ??= []);

function capture(message: AuthEmailMessage): void {
  if (process.env.NODE_ENV === "production") return;
  outbox.push(message);
  while (outbox.length > OUTBOX_LIMIT) outbox.shift();
}

/**
 * Local adapter used until a provider is configured: the message is captured
 * (never logged) so local flows and tests can read the link.
 */
const localProvider: EmailProvider = async (message) => {
  capture(message);
};

let provider: EmailProvider = localProvider;
let usingLocalAdapter = true;

/** Install the real provider (called once during bootstrap / app wiring). */
export function setEmailProvider(next: EmailProvider): void {
  provider = next;
  usingLocalAdapter = false;
}

/** Test helper: restore the local capture adapter and empty the outbox. */
export function resetEmailProvider(): void {
  provider = localProvider;
  usingLocalAdapter = true;
  outbox.length = 0;
}

/**
 * Sends an authentication email. Never throws into the caller's happy path:
 * a delivery failure must not leak whether an account exists, so failures are
 * logged (without the body) and swallowed.
 */
export async function sendAuthEmail(message: AuthEmailMessage): Promise<void> {
  try {
    await provider(message);
  } catch (error) {
    getLogger().error(
      { err: error, kind: message.kind },
      "authentication email could not be delivered",
    );
    return;
  }
  if (usingLocalAdapter) {
    getLogger().warn(
      { kind: message.kind },
      "authentication email captured locally — no provider configured",
    );
  }
}

/** Recent captured messages (non-production only). Empty in production. */
export function getOutbox(): readonly AuthEmailMessage[] {
  return process.env.NODE_ENV === "production" ? [] : [...outbox];
}

/** Test helper: most recent captured message of a kind, if any. */
export function lastCaptured(
  kind: AuthEmailKind,
): AuthEmailMessage | undefined {
  for (let index = outbox.length - 1; index >= 0; index -= 1) {
    const message = outbox[index];
    if (message?.kind === kind) return message;
  }
  return undefined;
}

/** Builds the local link for a Better Auth token-based flow. */
export function buildAuthLink(path: string, token: string): string {
  const base = (
    process.env.APP_URL ??
    process.env.BETTER_AUTH_URL ??
    ""
  ).replace(/\/+$/, "");
  const url = new URL(path, base ? `${base}/` : "http://localhost:3000");
  url.searchParams.set("token", token);
  return url.toString();
}
