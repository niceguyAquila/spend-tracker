import { DashboardShell } from "@/components/dashboard-shell";
import { requireAllowedUser } from "@/lib/auth";

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { user, role, globalRole } = await requireAllowedUser();

  return (
    <DashboardShell
      userEmail={user.email ?? ""}
      role={role}
      globalRole={globalRole}
    >
      {children}
    </DashboardShell>
  );
}
