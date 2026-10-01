import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";

import {
  CODE_ALPHABET,
  CODE_LENGTH,
  formatRedemptionCode,
  generateRedemptionCode,
  hashRedemptionCode,
  isRedemptionCodeShaped,
  normalizeRedemptionCode,
  parseRedemptionCode,
} from "./code";

/**
 * Code shape rules (checklist §9 bullets 4–5, PRD §20).
 *
 * Pure functions, so this suite runs everywhere — no services needed. What it
 * defends: the code is opaque randomness over a 32-symbol alphabet (5 bits
 * each), every spelling of one code hashes to one value, and a mistyped code
 * fails with a format hint rather than an unexplained miss.
 */
describe("redemption codes (checklist §9)", () => {
  it("mints 10 symbols from the 32-character alphabet, without repeats", () => {
    const seen = new Set<string>();
    for (let attempt = 0; attempt < 500; attempt++) {
      const code = generateRedemptionCode();
      expect(code).toHaveLength(CODE_LENGTH);
      for (const character of code) {
        expect(CODE_ALPHABET).toContain(character);
      }
      seen.add(code);
    }
    // 50 bits per code: collisions in 500 draws would be a broken CSPRNG.
    expect(seen.size).toBe(500);
  });

  it("displays as XXXXX-XXXXX and round-trips back to the code", () => {
    const code = generateRedemptionCode();
    const formatted = formatRedemptionCode(code);

    expect(formatted).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(formatted.replace("-", "")).toBe(code);
  });

  it("folds case, separators and misread characters into one canonical value", () => {
    // `A7K9` + `1` + `X2P4` + `0` — typed every way a human might send it.
    const canonical = "A7K91X2P40";
    const spellings = [
      canonical,
      canonical.toLowerCase(),
      " a7k91x2p40 ",
      "A7K9-1X2P40",
      "A7K9 1X2P4 0",
      // I → 1 and O → 0: the confusions the alphabet is designed to expose.
      "A7K9IX2P4O",
      "a7k9ix2p4o",
    ];

    for (const spelling of spellings) {
      expect(normalizeRedemptionCode(spelling)).toBe(canonical);
      expect(hashRedemptionCode(normalizeRedemptionCode(spelling))).toBe(
        hashRedemptionCode(canonical),
      );
    }

    expect(normalizeRedemptionCode(undefined)).toBe("");
    expect(normalizeRedemptionCode(12345678901)).toBe("");
  });

  it("recognizes a well-formed normalized code", () => {
    expect(isRedemptionCodeShaped("A7K91X2P40")).toBe(true);
    expect(isRedemptionCodeShaped("A7K91X2P4")).toBe(false); // too short
    expect(isRedemptionCodeShaped("A7K91X2P400")).toBe(false); // too long
    expect(isRedemptionCodeShaped("AAAAUUUUAA")).toBe(false); // U is excluded
    expect(isRedemptionCodeShaped("AAAAIIIIAA")).toBe(false); // I folds first
    expect(isRedemptionCodeShaped("A7K91X2P4 ")).toBe(false); // separator left
  });

  it("hashes to a 64-character lowercase hex digest", () => {
    const digest = hashRedemptionCode("A7K91X2P40");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    // Hashing is what makes the value opaque: the digest never contains the
    // code, and an un-normalized input is a *different* code.
    expect(digest).not.toContain("A7K91X2P40");
    expect(hashRedemptionCode(generateRedemptionCode())).not.toBe(digest);
  });

  it("parses whatever the cashier types into the canonical form", () => {
    const canonical = "A7K91X2P40";
    for (const typed of [
      canonical,
      "a7k91x2p40",
      "a7k9-1x2p40",
      " A7K9 1X2P4 0 ",
      "A7K9IX2P4O",
    ]) {
      expect(parseRedemptionCode(typed)).toBe(canonical);
    }
  });

  it("rejects a malformed code with the XXXXX-XXXXX hint", () => {
    const malformed = [
      "",
      "   ",
      "short",
      "!!!!!!!!!!",
      "A7K91X2P4", // nine characters
      "A7K91X2P400", // eleven characters
      "AAAAUUUUUU", // U is not in the alphabet
      "A7K91X2P4!", // punctuation the typed pattern refuses
      null,
      undefined,
      1234567890,
      { code: "A7K91X2P40" },
    ];

    for (const input of malformed) {
      expect(() => parseRedemptionCode(input)).toThrow(ValidationError);
      expect(() => parseRedemptionCode(input)).toThrow(/XXXXX-XXXXX/);
    }
  });
});
