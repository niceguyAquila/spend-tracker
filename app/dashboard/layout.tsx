import { DashboardShell } from "@/components/dashboard-shell";
import { requireAllowedUser } from "@/lib/auth";

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { user, role, globalRole, activeBrand, brandRoles } = await requireAllowedUser();

  return (
    <DashboardShell
      userEmail={user.email ?? ""}
      role={role}
      globalRole={globalRole}
      activeBrandId={activeBrand.id}
      activeBrandName={activeBrand.name}
      brandOptions={brandRoles.map((item) => ({ id: item.brand.id, name: item.brand.name }))}
    >
      {children}
    </DashboardShell>
  );
}
