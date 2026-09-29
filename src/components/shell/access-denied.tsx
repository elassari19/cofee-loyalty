import Link from "next/link";
import { ShieldAlertIcon } from "lucide-react";

import { homePathFor, type AuthContext } from "@/auth/context";
import { roleLabel } from "@/auth/roles";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Rendered by `/403` when an authenticated caller lacks the capability a
 * route requires. The check itself happened server-side in the route guard;
 * this screen only explains the outcome.
 */
export function AccessDenied({ auth }: { auth: AuthContext }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center">
          <span
            aria-hidden="true"
            className="bg-destructive/10 text-destructive mb-1 flex size-10 items-center justify-center rounded-full"
          >
            <ShieldAlertIcon className="size-5" />
          </span>
          <CardTitle>You don&apos;t have access</CardTitle>
          <CardDescription>
            Your account ({roleLabel(auth.role)}) is not allowed to open this
            area. Nothing was changed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href={homePathFor(auth)} />}>
            Back to my dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
