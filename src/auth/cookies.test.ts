import { describe, expect, it } from "vitest";

import type { CookieWriteOptions } from "./cookies";
import { applySetCookie, forwardSetCookies, parseSetCookie } from "./cookies";

/**
 * `set-cookie` parsing: server actions write Better Auth's cookies into Next's
 * store, so the attributes the library set must survive the transfer intact.
 */

describe("parseSetCookie", () => {
  it("reads the pair and every attribute", () => {
    const parsed = parseSetCookie(
      "better-auth.session_token=abc.def; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax; Secure",
    );
    expect(parsed).toEqual({
      name: "better-auth.session_token",
      value: "abc.def",
      options: {
        path: "/",
        maxAge: 604800,
        httpOnly: true,
        sameSite: "lax",
        secure: true,
      },
    });
  });

  it("reads an expiry date and keeps values containing '='", () => {
    const expires = new Date("2026-10-07T00:00:00.000Z");
    const parsed = parseSetCookie(
      `token=a=b=c; Expires=${expires.toUTCString()}; SameSite=strict`,
    );
    expect(parsed?.value).toBe("a=b=c");
    expect(parsed?.options.expires).toEqual(expires);
    expect(parsed?.options.sameSite).toBe("strict");
  });

  it("rejects entries that are not cookies", () => {
    expect(parseSetCookie("")).toBeNull();
    expect(parseSetCookie("no-separator")).toBeNull();
    expect(parseSetCookie("=value-without-a-name; Path=/")).toBeNull();
  });
});

describe("applySetCookie / forwardSetCookies", () => {
  function collector() {
    const written: Array<{
      name: string;
      value: string;
      options: CookieWriteOptions;
    }> = [];
    return {
      written,
      write: (name: string, value: string, options: CookieWriteOptions) =>
        written.push({ name, value, options }),
    };
  }

  it("writes one entry through the callback", () => {
    const { written, write } = collector();
    applySetCookie("cofe_active_merchant=e111; Path=/; Max-Age=10", write);
    expect(written).toEqual([
      {
        name: "cofe_active_merchant",
        value: "e111",
        options: { path: "/", maxAge: 10 },
      },
    ]);
  });

  it("drops malformed entries instead of writing garbage", () => {
    const { written, write } = collector();
    applySetCookie("broken-entry", write);
    expect(written).toEqual([]);
  });

  it("forwards every entry of a response", () => {
    const { written, write } = collector();
    forwardSetCookies(["a=1; Path=/", "broken", "b=2; HttpOnly"], write);
    expect(written.map((entry) => entry.name)).toEqual(["a", "b"]);
  });
});
