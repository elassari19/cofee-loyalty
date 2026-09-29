import { NextResponse, type NextRequest } from "next/server";

import { PREVIEW_COOKIE, isPreviewEnabled } from "@/auth/context";
import { isRole, ROLE_HOME } from "@/auth/roles";

/**
 * Dev-only "view as role" preview (checklist §3).
 *
 * §5 replaces preview sessions with real Better Auth sign-in; until then this
 * cookie lets each role's shell be reviewed in the browser. It is never active
 * in production: the cookie reader in `src/auth/context.ts` ignores it when
 * `NODE_ENV === "production"`, and this setter 404s outright — two layers.
 *
 * POST body: `role=<ROLE>` to start, or `clear=1` to end.
 */
export async function POST(request: NextRequest) {
  if (!isPreviewEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  const role = form?.get("role");
  const clear = form?.get("clear") ?? form?.get("signout");

  if (clear !== null && clear !== undefined) {
    const response = NextResponse.json({ ok: true, role: null });
    response.cookies.delete(PREVIEW_COOKIE);
    return response;
  }

  if (!isRole(role)) {
    return NextResponse.json(
      { ok: false, error: "Unknown role. Preview not changed." },
      { status: 400 },
    );
  }

  const response = NextResponse.json({
    ok: true,
    role,
    home: ROLE_HOME[role],
  });
  response.cookies.set(PREVIEW_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
    // Never marked Secure so it also works on plain-http local dev.
    secure: false,
  });
  return response;
}

/** The preview cookie is only ever set through a POST. */
export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
