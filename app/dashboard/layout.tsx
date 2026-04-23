import { DashboardNav } from "@/components/dashboard-nav";
import { requireAllowedUser } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { user, role, globalRole, activeBrand, brandRoles } = await requireAllowedUser();

  return (
    <main className="mx-auto min-h-screen w-full max-w-screen-2xl px-4 py-6 lg:px-8 lg:py-8 xl:px-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 lg:gap-6">
        <div className="max-w-3xl space-y-1">
          <h1 className="text-2xl font-semibold">{activeBrand.name} Web Finance Tracker</h1>
          <p className="text-sm text-slate-600">
            Separate workspaces for Web Spending analytics and Web Transaction imports.
          </p>
        </div>
        <div className="flex flex-col items-end text-right">
          <div className="flex items-start gap-3">
            <div>
              <p className="text-sm text-slate-600">{user.email}</p>
              <p className="mt-1 text-xs uppercase text-slate-500">{role}</p>
            </div>
            <div className="pt-0.5">
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>
      <DashboardNav
        isAdmin={globalRole === "admin"}
        activeBrandId={activeBrand.id}
        brandOptions={brandRoles.map((item) => ({ id: item.brand.id, name: item.brand.name }))}
      />
      {children}
    </main>
  );
}
