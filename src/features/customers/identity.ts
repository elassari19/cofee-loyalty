import { randomBytes } from "node:crypto";

/**
 * Opaque loyalty identity token (checklist §7 bullets 3 and 4, PRD §24).
 *
 * Pure module — no database, no request state — so the join flow, the staff
 * lookup endpoint (§8) and unit tests all agree on what a token *is*:
 *
 * - **Generated**: 32 bytes from `crypto.randomBytes`, base64url-encoded
 *   (43 characters, no padding). 256 bits of entropy makes brute-forcing a
 *   member's card infeasible, so the value never needs a "guessing" defence.
 * - **Opaque**: the value itself is random bytes — no member number, no
 *   email, no name, no merchant id. A photographed card therefore reveals
 *   nothing about who its owner is, which is exactly what PRD §24 asks for.
 * - **The QR payload is a URI, not the bare token**: `cofe://customer/<token>`
 *   gives a scanner a scheme to recognise and one opaque path segment to
 *   look up, with no query string where personal data could hide.
 *
 * Storage lives in `loyalty_identity_token` (src/db/entities); this module
 * only knows how to mint, shape and parse the value.
 */

/** Bytes of entropy behind one token — 256 bits. */
export const IDENTITY_TOKEN_BYTES = 32;

/** URI scheme the QR payload uses so a scanner can recognise our cards. */
export const IDENTITY_QR_SCHEME = "cofe";

/**
 * base64url of 32 bytes is 43 characters. The parser accepts the same shape
 * for values pasted in by hand (a cashier may type a card number from a
 * fallback receipt), so the bound is the storage limit, not the mint size.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;

/** Mints a fresh opaque token. Never derived from user data. */
export function generateIdentityToken(): string {
  return randomBytes(IDENTITY_TOKEN_BYTES).toString("base64url");
}

/** Whether `value` is shaped like a token (charset + length, no decoding). */
export function isIdentityToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/**
 * The exact bytes a QR image encodes. Carries the scheme and one opaque
 * segment — deliberately *not* a full URL with the merchant slug, so the
 * printed card stays a pure identifier rather than a link that leaks which
 * shops someone frequents.
 */
export function identityQrPayload(token: string): string {
  if (!isIdentityToken(token)) {
    throw new Error("Refusing to encode a malformed identity token.");
  }
  return `${IDENTITY_QR_SCHEME}://customer/${token}`;
}

/**
 * Extracts the token from a scanned/pasted payload.
 *
 * Accepts the canonical `cofe://customer/<token>` form and a bare token
 * (typed by hand). Anything else — including payloads that smuggle extra
 * segments or query strings — is rejected as `null` rather than truncated,
 * so a hostile QR cannot partially match its way into a lookup.
 */
export function parseIdentityQrPayload(payload: unknown): string | null {
  if (typeof payload !== "string") return null;
  const value = payload.trim();
  if (!value) return null;

  const prefix = `${IDENTITY_QR_SCHEME}://customer/`;
  const token = value.startsWith(prefix) ? value.slice(prefix.length) : value;

  // A canonical payload must be exactly scheme + one segment: no trailing
  // slash, query, fragment or a second path piece.
  if (value.startsWith(prefix)) {
    if (!token || token.includes("/") || token.includes("?")) return null;
    if (token.includes("#")) return null;
  }
  return isIdentityToken(token) ? token : null;
}
