import { AdminShell } from "@/components/admin/shell";
import { getCurrentUser } from "@/lib/auth/session";
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) { const session = await getCurrentUser(); return <AdminShell user={session?.user}>{children}</AdminShell>; }
