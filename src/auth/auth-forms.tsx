"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircleIcon, MailCheckIcon } from "lucide-react";

import {
  requestPasswordResetAction,
  resendVerificationAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
} from "@/auth/actions";
import { report } from "@/auth/client-actions";
import {
  AppForm,
  SubmitButton,
  TextField,
  useZodForm,
} from "@/components/patterns/form";
import { notify } from "@/components/patterns/toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  type PasswordResetRequestValues,
  type ResetPasswordValues,
  type SignInValues,
  type SignUpValues,
} from "@/lib/schemas";

/**
 * Client side of the authentication flows (checklist §5).
 *
 * Every form follows the same contract: validate locally with the shared zod
 * schema for instant feedback, then POST to the server action, which
 * re-validates, rate limits and audits. Failures come back as an
 * `ActionResult` and are shown as-is; a successful flow ends in the action's
 * `redirect()`, which is handled by `report` from `./client-actions`.
 */

function AuthHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground text-center text-sm">{children}</p>
  );
}

function AuthLinkRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      {children}
    </div>
  );
}

const linkClass = "underline underline-offset-4 hover:text-foreground";

export function SignInForm({ next }: { next?: string }) {
  const form = useZodForm(signInSchema, {
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInValues) {
    await report(() => signInAction({ ...values, next }));
  }

  return (
    <AppForm form={form} onSubmit={onSubmit} className="gap-4">
      <TextField
        form={form}
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        required
      />
      <TextField
        form={form}
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
      />
      <SubmitButton
        pending={form.formState.isSubmitting}
        pendingLabel="Signing in…"
        className="w-full"
      >
        Sign in
      </SubmitButton>
      <AuthLinkRow>
        <Link href="/forgot-password" className={linkClass}>
          Forgot your password?
        </Link>
        <Link href="/sign-up" className={linkClass}>
          Create an account
        </Link>
      </AuthLinkRow>
    </AppForm>
  );
}

export function SignUpForm({ next }: { next?: string }) {
  const form = useZodForm(signUpSchema, {
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSubmit(values: SignUpValues) {
    await report(() => signUpAction({ ...values, next }));
  }

  return (
    <AppForm form={form} onSubmit={onSubmit} className="gap-4">
      <TextField
        form={form}
        name="name"
        label="Your name"
        autoComplete="name"
        placeholder="Alex Rivera"
        required
      />
      <TextField
        form={form}
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        required
      />
      <TextField
        form={form}
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        description="At least 10 characters."
        required
      />
      <SubmitButton
        pending={form.formState.isSubmitting}
        pendingLabel="Creating account…"
        className="w-full"
      >
        Create account
      </SubmitButton>
      <AuthLinkRow>
        <AuthHint>
          Already have an account?{" "}
          <Link href="/sign-in" className={linkClass}>
            Sign in
          </Link>
        </AuthHint>
      </AuthLinkRow>
    </AppForm>
  );
}

export function RequestPasswordResetForm() {
  const [sent, setSent] = useState<string | null>(null);
  const form = useZodForm(
    // The same shape as the request schema; typed locally so the form keeps
    // its own values without widening the action's payload.
    signInSchema.pick({ email: true }),
    { defaultValues: { email: "" } },
  );

  async function onSubmit(values: PasswordResetRequestValues) {
    const result = await requestPasswordResetAction(values);
    if (result.ok) setSent(result.data.message);
    else notify.error(result.message);
  }

  if (sent) {
    return (
      <Alert>
        <MailCheckIcon aria-hidden="true" />
        <AlertTitle>Check your inbox</AlertTitle>
        <AlertDescription>{sent}</AlertDescription>
      </Alert>
    );
  }

  return (
    <AppForm form={form} onSubmit={onSubmit} className="gap-4">
      <TextField
        form={form}
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        description="We'll email a link that expires in one hour."
        required
      />
      <SubmitButton
        pending={form.formState.isSubmitting}
        pendingLabel="Sending…"
        className="w-full"
      >
        Email me a reset link
      </SubmitButton>
      <AuthLinkRow>
        <Link href="/sign-in" className={linkClass}>
          Back to sign in
        </Link>
      </AuthLinkRow>
    </AppForm>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const form = useZodForm(resetPasswordSchema, {
    defaultValues: { token, newPassword: "" },
  });

  async function onSubmit(values: ResetPasswordValues) {
    await report(() => resetPasswordAction(values));
  }

  return (
    <AppForm form={form} onSubmit={onSubmit} className="gap-4">
      <TextField
        form={form}
        name="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        description="At least 10 characters. Signing out other sessions happens automatically."
        required
      />
      <SubmitButton
        pending={form.formState.isSubmitting}
        pendingLabel="Updating…"
        className="w-full"
      >
        Set new password
      </SubmitButton>
      <AuthLinkRow>
        <Link href="/sign-in" className={linkClass}>
          Back to sign in
        </Link>
      </AuthLinkRow>
    </AppForm>
  );
}

export function ResendVerificationForm() {
  const [sent, setSent] = useState<string | null>(null);
  const form = useZodForm(signInSchema.pick({ email: true }), {
    defaultValues: { email: "" },
  });

  async function onSubmit(values: PasswordResetRequestValues) {
    const result = await resendVerificationAction(values);
    if (result.ok) setSent(result.data.message);
    else notify.error(result.message);
  }

  if (sent) {
    return (
      <Alert>
        <MailCheckIcon aria-hidden="true" />
        <AlertTitle>Sent</AlertTitle>
        <AlertDescription>{sent}</AlertDescription>
      </Alert>
    );
  }

  return (
    <AppForm form={form} onSubmit={onSubmit} className="gap-4">
      <TextField
        form={form}
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        description="We'll send a fresh verification link."
        required
      />
      <SubmitButton
        pending={form.formState.isSubmitting}
        pendingLabel="Sending…"
      >
        Resend verification email
      </SubmitButton>
      <AuthLinkRow>
        <Link href="/sign-in" className={linkClass}>
          Back to sign in
        </Link>
      </AuthLinkRow>
    </AppForm>
  );
}

export function UnverifiedNotice() {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>Email not verified</AlertTitle>
      <AlertDescription>
        Open the link we sent when you signed up, then try again. Need a new
        one? Send it below.
      </AlertDescription>
    </Alert>
  );
}
