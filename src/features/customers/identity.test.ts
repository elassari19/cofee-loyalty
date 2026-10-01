import { describe, expect, it } from "vitest";

import {
  IDENTITY_QR_SCHEME,
  IDENTITY_TOKEN_BYTES,
  generateIdentityToken,
  identityQrPayload,
  isIdentityToken,
  parseIdentityQrPayload,
} from "./identity";

const token = generateIdentityToken();

describe("generateIdentityToken", () => {
  it("mints 256 bits of base64url entropy", () => {
    expect(IDENTITY_TOKEN_BYTES).toBe(32);
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never repeats", () => {
    const minted = new Set(
      Array.from({ length: 500 }, () => generateIdentityToken()),
    );
    expect(minted.size).toBe(500);
  });

  it("carries nothing about the member — the QR must not leak PII", () => {
    // The base64url alphabet has no @, :, /, ? or # — no name, address or
    // merchant slug can survive encoding into a token.
    expect(token).not.toMatch(/[@:/?#.%]/);
    expect(token).not.toContain(IDENTITY_QR_SCHEME);
  });
});

describe("isIdentityToken", () => {
  it("accepts a minted token and rejects anything else", () => {
    expect(isIdentityToken(token)).toBe(true);
    expect(isIdentityToken("too-short")).toBe(false);
    expect(isIdentityToken(`${token}=`)).toBe(false);
    expect(isIdentityToken(`${token}/more`)).toBe(false);
    expect(isIdentityToken("")).toBe(false);
    expect(isIdentityToken(null)).toBe(false);
    expect(isIdentityToken(42)).toBe(false);
  });
});

describe("identityQrPayload", () => {
  it("encodes scheme plus one opaque segment", () => {
    expect(identityQrPayload(token)).toBe(
      `${IDENTITY_QR_SCHEME}://customer/${token}`,
    );
  });

  it("refuses to encode a malformed token", () => {
    expect(() => identityQrPayload("nope")).toThrow(/malformed/i);
  });
});

describe("parseIdentityQrPayload", () => {
  it("round-trips its own payload", () => {
    expect(parseIdentityQrPayload(identityQrPayload(token))).toBe(token);
  });

  it("accepts a bare or whitespace-padded token typed by hand", () => {
    expect(parseIdentityQrPayload(token)).toBe(token);
    expect(parseIdentityQrPayload(`  ${identityQrPayload(token)}  `)).toBe(
      token,
    );
  });

  it("returns null instead of partially matching a hostile payload", () => {
    expect(parseIdentityQrPayload(`${IDENTITY_QR_SCHEME}://customer/`)).toBe(
      null,
    );
    expect(
      parseIdentityQrPayload(`${IDENTITY_QR_SCHEME}://customer/${token}/x`),
    ).toBe(null);
    expect(
      parseIdentityQrPayload(`${IDENTITY_QR_SCHEME}://customer/${token}?a=1`),
    ).toBe(null);
    expect(
      parseIdentityQrPayload(`${IDENTITY_QR_SCHEME}://customer/${token}#a`),
    ).toBe(null);
    expect(parseIdentityQrPayload(`https://customer/${token}`)).toBe(null);
    expect(parseIdentityQrPayload("cofe://evil/token")).toBe(null);
    expect(parseIdentityQrPayload("")).toBe(null);
    expect(parseIdentityQrPayload("   ")).toBe(null);
    expect(parseIdentityQrPayload(null)).toBe(null);
    expect(parseIdentityQrPayload(undefined)).toBe(null);
    expect(parseIdentityQrPayload(42)).toBe(null);
    expect(parseIdentityQrPayload({ token })).toBe(null);
  });
});
