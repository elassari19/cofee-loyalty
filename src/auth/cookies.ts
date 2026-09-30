/**
 * `set-cookie` forwarding (checklist §5).
 *
 * Better Auth issues session cookies from an endpoint response; inside a
 * server action there is no response to attach them to, so the action writes
 * them into Next's cookie store instead. The raw entry is parsed here rather
 * than rebuilt from the session token, because the library signs the cookie
 * value and owns its attributes (path, `HttpOnly`, `SameSite`, expiry).
 */

export interface CookieWriteOptions {
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
}

export function parseSetCookie(
  entry: string,
): { name: string; value: string; options: CookieWriteOptions } | null {
  const [pair, ...attributes] = entry.split(";");
  if (!pair) return null;
  const separator = pair.indexOf("=");
  if (separator < 0) return null;

  const name = pair.slice(0, separator).trim();
  if (!name) return null;

  const options: CookieWriteOptions = {};
  for (const attribute of attributes) {
    const index = attribute.indexOf("=");
    const key = (index < 0 ? attribute : attribute.slice(0, index))
      .trim()
      .toLowerCase();
    const value = index < 0 ? "" : attribute.slice(index + 1).trim();

    if (key === "path") options.path = value;
    else if (key === "domain") options.domain = value;
    else if (key === "max-age") options.maxAge = Number(value);
    else if (key === "expires") options.expires = new Date(value);
    else if (key === "httponly") options.httpOnly = true;
    else if (key === "secure") options.secure = true;
    else if (key === "samesite" && value) {
      options.sameSite = value.toLowerCase() as CookieWriteOptions["sameSite"];
    }
  }

  return { name, value: pair.slice(separator + 1).trim(), options };
}

/** Parses and writes one `set-cookie` entry; malformed entries are dropped. */
export function applySetCookie(
  entry: string,
  write: (name: string, value: string, options: CookieWriteOptions) => void,
): void {
  const parsed = parseSetCookie(entry);
  if (parsed) write(parsed.name, parsed.value, parsed.options);
}

/**
 * Cancels the encoding Next applies when a value enters its cookie store.
 *
 * Better Auth already percent-encodes the values it puts in `set-cookie`
 * (its signed session token ends in base64 characters). Storing that encoded
 * string as-is would make Next encode it a *second* time, and the raw cookie
 * header the library then receives no longer matches what it issued — the
 * session would simply not resolve. Decoding once here restores the exact
 * bytes Better Auth wrote; anything undecodable is passed through untouched.
 */
export function decodeStoredValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Forwards every cookie a response carried into `write`. */
export function forwardSetCookies(
  cookies: readonly string[],
  write: (name: string, value: string, options: CookieWriteOptions) => void,
): void {
  for (const entry of cookies) applySetCookie(entry, write);
}
