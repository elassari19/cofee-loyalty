import { requirePageAudience } from "@/auth/guard";
import { AppShell } from "@/components/shell/app-shell";

export default async function MerchantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requirePageAudience("merchant");
  return <AppShell auth={auth}>{children}</AppShell>;
}
