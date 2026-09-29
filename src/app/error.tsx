"use client";

import { ErrorState } from "@/components/patterns/states";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <ErrorState
        title="This page hit an unexpected error"
        description={
          error.digest
            ? `Reference ${error.digest}. Your data is untouched — try again in a moment.`
            : undefined
        }
        onRetry={reset}
        className="w-full max-w-md"
      />
    </div>
  );
}
