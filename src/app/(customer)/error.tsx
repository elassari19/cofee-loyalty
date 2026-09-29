"use client";

import { ErrorState } from "@/components/patterns/states";

export default function CustomerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <ErrorState
        title="Couldn't load your rewards"
        description={
          error.digest
            ? `Reference ${error.digest}. Your balance is untouched.`
            : "Your balance is untouched."
        }
        onRetry={reset}
        className="w-full max-w-md"
      />
    </div>
  );
}
