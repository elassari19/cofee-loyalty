import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import {
  homePathFor,
  isPreviewEnabled,
  resolveAuthFromCookieSource,
} from "@/auth/context";

import { PreviewSwitcher } from "./preview-switcher";

export const metadata: Metadata = {
  title: "Role preview",
};

/** Dev-only role switcher; the production build redirects this route away. */
export default async function PreviewPage() {
  if (!isPreviewEnabled()) notFound();

  const auth = await resolveAuthFromCookieSource(await cookies());
  if (auth && !auth.preview) redirect(homePathFor(auth));

  return (
    <div className="min-h-svh">
      <header className="border-border border-b">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight underline-offset-4 hover:underline"
          >
            Loyalty
          </Link>
          <span className="text-muted-foreground font-mono text-xs">
            development preview
          </span>
        </div>
      </header>
      <main>
        <PreviewSwitcher
          current={auth ? { role: auth.role, preview: auth.preview } : null}
        />
      </main>
    </div>
  );
}
