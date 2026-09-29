import { requirePageAudience } from "@/auth/guard";
import { AppShell } from "@/components/shell/app-shell";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requirePageAudience("platform");
  return <AppShell auth={auth}>{children}</AppShell>;
}
