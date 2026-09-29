import { requirePageAudience } from "@/auth/guard";
import { AppShell } from "@/components/shell/app-shell";

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requirePageAudience("customer");
  return <AppShell auth={auth}>{children}</AppShell>;
}
