import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CircleAlertIcon, GiftIcon, SparklesIcon } from "lucide-react";

import { resolveAuthFromCookieSource } from "@/auth/context";
import { SignOutButton } from "@/auth/sign-out-button";
import {
  findMembershipForUser,
  resolveJoinTarget,
} from "@/features/customers/service";
import { summarizeProgram } from "@/features/loyalty/schemas";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";

import { JoinButton } from "./join-button";
import { JoinSignUpForm } from "./join-form";

interface JoinPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ joined?: string }>;
}

export async function generateMetadata({
  params,
}: JoinPageProps): Promise<Metadata> {
  const { slug } = await params;
  const target = await resolveJoinTarget(slug);
  return { title: target ? `Join ${target.merchant.name}` : "Join" };
}

/**
 * The public join landing page (checklist §7 bullet 1, PRD §14).
 *
 * The URL carries only the merchant slug — no ids, no tokens, no personal
 * data — so scanning it reveals which shop you are about to join and nothing
 * else. What the page does depends on who is looking:
 *
 *   - anonymous → registration form (signs up *and* enrols in one action);
 *   - signed-in customer → one button, or "open my card" if they already
 *     belong; enrolment itself is idempotent either way;
 *   - signed-in merchant/platform account → told plainly that this link is
 *     for customer accounts, rather than silently enrolling an identity that
 *     could never see the membership;
 *   - suspended merchant → no enrolment controls at all.
 *
 * Nothing here trusts the URL beyond the slug: the merchant, its program and
 * the visitor's existing membership are all resolved server-side.
 */
export default async function JoinPage({
  params,
  searchParams,
}: JoinPageProps) {
  const { slug } = await params;
  const { joined } = await searchParams;
  const target = await resolveJoinTarget(slug);
  if (!target) notFound();

  const store = await cookies();
  const auth = await resolveAuthFromCookieSource(store, await headers());
  const preview = auth?.preview ? auth : null;
  const customer =
    auth && !auth.preview && auth.role === "CUSTOMER" ? auth : null;
  const existing = customer
    ? await findMembershipForUser(customer.userId, target.merchant.id)
    : null;

  const unit = target.program?.unitName ?? "points";
  const bullets =
    target.program && target.program.status === "active"
      ? summarizeProgram({
          type: target.program.type,
          unitName: target.program.unitName,
          configuration: target.program.configuration,
          currency: target.merchant.currency,
        })
      : [];

  return (
    <AuthCard
      icon={SparklesIcon}
      title={`Join ${target.merchant.name}`}
      description={
        target.merchant.category
          ? `${target.merchant.category} · loyalty program`
          : "Loyalty program"
      }
      footnote={
        <>
          Already have an account?{" "}
          <Link
            href={`/sign-in?next=${encodeURIComponent(`/join/${slug}`)}`}
            className="hover:text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      {joined === "0" ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Almost there</AlertTitle>
          <AlertDescription>
            Your account was created, but joining didn&apos;t finish. Nothing
            was lost — use the button below to complete it.
          </AlertDescription>
        </Alert>
      ) : null}

      {!target.open ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Not accepting new members</AlertTitle>
          <AlertDescription>
            {target.merchant.name} has paused new sign-ups for its loyalty
            program. Try again in a little while.
          </AlertDescription>
        </Alert>
      ) : null}

      {target.open ? (
        <>
          {bullets.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{target.program?.name}</p>
              <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
                {bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              This program&apos;s rules aren&apos;t published yet — you can
              still join and start collecting {unit}.
            </p>
          )}

          {target.rewards.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <GiftIcon aria-hidden="true" className="size-4" />
                Rewards you can unlock
              </p>
              <ul className="flex flex-col gap-1.5">
                {target.rewards.map((reward) => (
                  <li
                    key={reward.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate">{reward.name}</span>
                    <Badge variant="outline">
                      {formatNumber(reward.cost)} {unit}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview ? (
            <Alert>
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Preview mode</AlertTitle>
              <AlertDescription>
                You&apos;re browsing as a preview role, so there&apos;s nothing
                to join here. Sign out to create a customer account.
              </AlertDescription>
            </Alert>
          ) : existing ? (
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground text-sm">
                You&apos;re already a member — your card holds{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {formatNumber(existing.balance)} {unit}
                </span>
                .
              </p>
              <Button render={<Link href="/me" />} className="w-full">
                Open my card
              </Button>
            </div>
          ) : customer ? (
            <JoinButton slug={slug} />
          ) : auth ? (
            <Alert>
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Use a customer account</AlertTitle>
              <AlertDescription>
                You&apos;re signed in as {auth.displayName}, which is a staff or
                business account. Sign out and join with a customer account —
                memberships never mix with a workspace.
              </AlertDescription>
              <SignOutButton variant="outline" className="w-full">
                Sign out
              </SignOutButton>
            </Alert>
          ) : (
            <JoinSignUpForm slug={slug} />
          )}
        </>
      ) : null}
    </AuthCard>
  );
}
