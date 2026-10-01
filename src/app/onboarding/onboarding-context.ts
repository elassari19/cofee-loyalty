import { redirect } from "next/navigation";

import { homePathFor, type AuthContext } from "@/auth/context";
import { requirePageAccess } from "@/auth/guard";
import {
  loadOnboardingState,
  prerequisitesMet,
  resolveOnboardingTarget,
  type OnboardingState,
  type OnboardingStepId,
} from "@/features/merchants/onboarding";

/**
 * Server-side entry helpers for the `/onboarding` wizard (checklist §6
 * bullet 8).
 *
 * Every route re-derives its position from the database rather than trusting
 * a step number in the URL: the layout answers *who may be here*, the step
 * helpers answer *may this step be reached yet*. Redirects therefore happen
 * during render, before any form is shown, and a hand-typed `/onboarding/launch`
 * with an unfinished profile lands on the first incomplete step instead.
 */

export interface OnboardingContext {
  auth: AuthContext;
  /** `null` when this identity owns no business yet — the registration step. */
  state: OnboardingState | null;
}

export interface OnboardingStepContext {
  auth: AuthContext;
  state: OnboardingState;
}

/**
 * Layout guard: authenticated, holds `merchant.create`, and is a real
 * identity. Dev-preview contexts own nothing they could onboard, and
 * platform administrators manage tenants from `/admin`, so both are sent
 * to their own home route instead of being offered a registration form.
 */
export async function guardOnboarding(): Promise<AuthContext> {
  const auth = await requirePageAccess("merchant.create");
  if (auth.preview || auth.role === "SUPER_ADMIN") {
    redirect(homePathFor(auth));
  }
  return auth;
}

/** Guard + progress state for the wizard hub. */
export async function requireOnboarding(): Promise<OnboardingContext> {
  const auth = await guardOnboarding();
  const merchant = await resolveOnboardingTarget(auth);
  const state = merchant ? await loadOnboardingState(merchant) : null;
  return { auth, state };
}

/**
 * Guard + state for one wizard step. Without a business there is nothing to
 * configure (the hub shows registration), and when earlier steps are still
 * incomplete the visitor is redirected to the first one that is — completed
 * steps remain revisitable for edits.
 */
export async function requireStep(
  step: OnboardingStepId,
): Promise<OnboardingStepContext> {
  const { auth, state } = await requireOnboarding();
  if (!state) redirect("/onboarding");
  if (!prerequisitesMet(state, step)) {
    redirect(state.nextStep?.href ?? "/onboarding");
  }
  return { auth, state };
}
