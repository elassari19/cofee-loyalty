import Link from "next/link";
import { SearchXIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-5 p-6 text-center">
      <span
        aria-hidden="true"
        className="bg-muted flex size-11 items-center justify-center rounded-full"
      >
        <SearchXIcon className="text-muted-foreground size-5" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
          That URL doesn&apos;t exist in this workspace. It may have been
          renamed, or it belongs to a role you can&apos;t reach.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button render={<Link href="/" />}>Back to overview</Button>
        <Button variant="outline" render={<Link href="/preview" />}>
          Open role preview
        </Button>
      </div>
    </div>
  );
}
