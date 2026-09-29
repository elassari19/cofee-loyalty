import { requirePageAudience } from "@/auth/guard";
import { AppShell } from "@/components/shell/app-shell";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requirePageAudience("staff");
  return <AppShell auth={auth}>{children}</AppShell>;
}
