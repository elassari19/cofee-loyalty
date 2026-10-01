import { getEnv } from "@/lib/env";

/**
 * The public join link (checklist §6 bullet 7, PRD §9).
 *
 * The URL carries the merchant's *slug* and nothing else — no ids of people,
 * no tokens, no email or phone. Scanning it only reveals which business you
 * are about to join; identity and secrets are established later by the
 * enrollment flow (§7), never encoded here.
 */
export function joinUrlFor(slug: string): string {
  const base = getEnv().APP_URL.replace(/\/+$/, "");
  return `${base}/join/${encodeURIComponent(slug)}`;
}
