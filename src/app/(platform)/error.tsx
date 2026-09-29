"use client";

import { ErrorState } from "@/components/patterns/states";

export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <ErrorState
        title="Couldn't load this admin view"
        description={
          error.digest
            ? `Reference ${error.digest}. No changes were made.`
            : undefined
        }
        onRetry={reset}
        className="w-full max-w-md"
      />
    </div>
  );
}
