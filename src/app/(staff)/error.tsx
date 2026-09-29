"use client";

import { ErrorState } from "@/components/patterns/states";

export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <ErrorState
        title="The register couldn't load"
        description={
          error.digest
            ? `Reference ${error.digest}. No transaction was recorded.`
            : "No transaction was recorded."
        }
        onRetry={reset}
        className="w-full max-w-md"
      />
    </div>
  );
}
