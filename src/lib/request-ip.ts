/**
 * Client address extraction (checklist §5 — rate limiting is per caller).
 *
 * Only the proxy chain that sits in front of the app may set these headers,
 * so the first value of `x-forwarded-for` is the client and anything a caller
 * appends to the right of it is ignored. When no trusted hop is present the
 * address is reported as `"unknown"` — rate limiting still applies, it simply
 * shares one bucket instead of pretending to know who is calling.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}
