import { NextResponse } from "next/server";

import { getOutbox } from "@/integrations/email";

/**
 * Local development inbox (checklist §5).
 *
 * Password-reset and email-verification links are only ever delivered by the
 * configured email provider; locally the provider captures the message instead
 * of sending it (see `src/integrations/email`). This endpoint exposes that
 * capture so a developer — or an end-to-end test — can follow the link in a
 * browser without a mailbox.
 *
 * It never exists in production: the response is a hard 404 there, alongside
 * the capture adapter itself which refuses to store messages when
 * `NODE_ENV === "production"`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(
    { messages: getOutbox() },
    { headers: { "cache-control": "no-store" } },
  );
}

/** The outbox is read-only. */
export function POST(): NextResponse {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
