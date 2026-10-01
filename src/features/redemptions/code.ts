import { createHash, randomBytes } from "node:crypto";

import { ValidationError } from "@/lib/errors";

/**
 * Redemption verification codes (checklist §9 bullets 4 and 5, PRD §20).
 *
 * A pure module — no database, no request state — so issuing, verifying and
 * the tests all agree on what a code *is*:
 *
 * - **Generated**: 10 characters drawn from a 32-symbol alphabet with
 *   `crypto.randomBytes`. 256 % 32 == 0, so `byte % 32` is an unbiased index:
 *   50 bits of entropy per code, and nothing is ever derived from customer
 *   data. Combined with the `redeemCode` rate limit, guessing a live code is
 *   not a practical attack.
 * - **Opaque**: the value is pure randomness — no member number, no email, no
 *   reward id — so a photographed screen reveals nothing about who its owner
 *   is.
 * - **Stored hashed**: only `sha256(normalized)` reaches the database, in the
 *   unique `code_hash` column. A leaked table of hashes does not hand anyone a
 *   usable code, and lookups go through the same hash so the clear-text value
 *   never has to be persisted or logged.
 * - **Forgiving to type**: case, spaces and hyphens are stripped, and the
 *   classic confusions (`I`/`L` → `1`, `O` → `0`) are corrected before
 *   hashing, so a cashier who reads the code aloud cannot mistype it into a
 *   miss.
 */

/** Entropy per code, in alphabet symbols. */
export const CODE_LENGTH = 10;

/**
 * Crockford base32 minus `I`, `L`, `O` and `U`: 32 symbols = exactly 5 bits,
 * and no character that is easily misread or that spells anything rude.
 */
export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Characters per display group — `XXXXX-XXXXX`. */
const GROUP_SIZE = 5;

/** Shapes a code may take when typed: letters, digits, spaces, hyphens. */
const TYPED_PATTERN = /^[0-9A-Za-z -]+$/;

/**
 * Canonical form of a typed code: uppercased, separators removed and the
 * confusable letters folded to the digits they look like. This is exactly the
 * string that gets hashed, so every spelling of one code shares one hash.
 */
export function normalizeRedemptionCode(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}

/** Whether a normalized value is a well-formed code (charset + length). */
export function isRedemptionCodeShaped(normalized: string): boolean {
  if (normalized.length !== CODE_LENGTH) return false;
  for (const character of normalized) {
    if (!CODE_ALPHABET.includes(character)) return false;
  }
  return true;
}

/** `ABCDE` → `ABCDE-ABCDE` — what the customer's screen shows. */
export function formatRedemptionCode(normalized: string): string {
  const groups: string[] = [];
  for (let index = 0; index < normalized.length; index += GROUP_SIZE) {
    groups.push(normalized.slice(index, index + GROUP_SIZE));
  }
  return groups.join("-");
}

/** Mints a fresh code in canonical (unformatted) shape. */
export function generateRedemptionCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}

/** SHA-256 of the canonical form, hex — the only form that is stored. */
export function hashRedemptionCode(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Validates and canonicalizes a code a human typed or scanned.
 *
 * Throws a `ValidationError` with the format hint rather than silently
 * returning `null`: the shape of a code is public (it is printed on the
 * customer's own screen), so a friendly "codes look like XXXXX-XXXXX" helps a
 * cashier far more than a generic "not found" — while an unknown-but-well-formed
 * code stays an indistinguishable miss at the lookup itself.
 */
export function parseRedemptionCode(input: unknown): string {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw || !TYPED_PATTERN.test(raw)) {
    const message = `Enter the code exactly as the customer shows it — ${formatRedemptionCode("X".repeat(CODE_LENGTH))}.`;
    throw new ValidationError([{ path: "code", message }], message);
  }
  const normalized = normalizeRedemptionCode(raw);
  if (!isRedemptionCodeShaped(normalized)) {
    const message = `Enter the full code — ${formatRedemptionCode("X".repeat(CODE_LENGTH))}.`;
    throw new ValidationError([{ path: "code", message }], message);
  }
  return normalized;
}
