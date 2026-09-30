import { notify } from "@/components/patterns/toast";

import type { ActionResult } from "./action-guard";

/**
 * Client-side helpers shared by the auth and tenant forms.
 *
 * `redirect()` inside a server action rejects the promise it was awaited with
 * Next's own control-flow error — navigation already happened by then, so it
 * must be swallowed rather than reported as a failure.
 */

export function isNextRedirect(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Awaits an auth action and surfaces its failure as a toast.
 * Resolves `true` when the action succeeded *or* redirected away.
 */
export async function report(
  run: () => Promise<ActionResult<unknown>>,
): Promise<boolean> {
  try {
    const result = await run();
    if (!result.ok) {
      notify.error(result.message);
      return false;
    }
    return true;
  } catch (error) {
    if (isNextRedirect(error)) return true;
    notify.error("Something went wrong. Please try again.");
    return false;
  }
}
