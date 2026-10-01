import type { ReactNode } from "react";
import { CreditCardIcon, SparklesIcon } from "lucide-react";
import { redirect } from "next/navigation";

import type { AuthContext } from "@/auth/context";
import { PageContainer, PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/states";
import {
  loadCustomerContext,
  type CustomerContext,
} from "@/features/customers/service";

/**
 * Shared membership resolution for the `/me` portal (checklist §7 bullet 5).
 *
 * Every page behind the customer shell asks the same three questions in the
 * same order — is this a preview, does this identity hold a membership, and
 * is one of them active — and then renders either the "nothing yet" screen or
 * its own content for the one membership the session resolved. Routing to the
 * tenant chooser happens here so no page can forget it and render an
 * arbitrary membership instead.
 */

export type MembershipState =
  | { kind: "ready"; ctx: CustomerContext }
  | { kind: "redirectTo"; path: "/choose-merchant" }
  | { kind: "empty"; empty: "preview" | "none"; displayName: string };

export async function loadMembershipState(
  auth: AuthContext,
): Promise<MembershipState> {
  const state = await loadCustomerContext(auth);
  switch (state.kind) {
    case "ready":
      return { kind: "ready", ctx: state.ctx };
    case "choose":
      return { kind: "redirectTo", path: "/choose-merchant" };
    case "preview":
      return { kind: "empty", empty: "preview", displayName: auth.displayName };
    case "empty":
      return { kind: "empty", empty: "none", displayName: auth.displayName };
  }
}

/** First name only, so a full account name doesn't head a greeting. */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

/** The screen shown when there is no membership to render yet. */
export function PortalEmpty({
  empty,
  displayName,
}: {
  empty: "preview" | "none";
  displayName: string;
}) {
  if (empty === "preview") {
    return (
      <PageContainer>
        <PageHeader
          title="Customer portal"
          description="This is where members see their balance, card, rewards and activity."
        />
        <EmptyState
          icon={SparklesIcon}
          title="Preview mode"
          description="A preview session has no membership behind it, so there's nothing to show here. Sign out and join a program to see the real thing."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={`Hi, ${firstName(displayName)}`}
        description="Your card, balance and rewards live here."
      />
      <EmptyState
        icon={CreditCardIcon}
        title="You haven't joined a loyalty program yet"
        description="Scan a merchant's join code — or open their join link — to create your loyalty card. Your membership, balance and rewards will appear here."
      />
    </PageContainer>
  );
}

/** Branches on the shared state: empty → banner, undecided → chooser, else content. */
export function renderMembership(
  state: MembershipState,
  displayName: string,
  ready: (ctx: CustomerContext) => ReactNode,
): ReactNode {
  if (state.kind === "redirectTo") redirect(state.path);
  if (state.kind === "empty") {
    return <PortalEmpty empty={state.empty} displayName={displayName} />;
  }
  return ready(state.ctx);
}
