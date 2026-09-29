import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { resolveAuthFromCookieSource } from "@/auth/context";
import { AccessDenied } from "@/components/shell/access-denied";

export const metadata: Metadata = {
  title: "Access denied",
};

/**
 * 403 target of `requirePageAccess` (checklist §3 bullet 6). Lives outside
 * every role group so the guard can redirect here without looping.
 */
export default async function ForbiddenPage() {
  const auth = await resolveAuthFromCookieSource(await cookies());
  if (!auth) redirect("/sign-in");
  return <AccessDenied auth={auth} />;
}
