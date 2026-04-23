import { DashboardNav } from "@/components/dashboard-nav";
import { requireAllowedUser } from "@/lib/auth";
import { BrandSwitcher } from "@/components/brand-switcher";

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { user, role, globalRole, activeBrand, brandRoles } = await requireAllowedUser();

  return (
    <main className="mx-auto min-h-screen max-w-7xl p-6">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{activeBrand.name} Web Finance Tracker</h1>
          <p className="text-sm text-slate-600">
            Separate workspaces for Web Spending analytics and Web Transaction imports.
          </p>
        </div>
        <div className="text-right">
          <BrandSwitcher
            activeBrandId={activeBrand.id}
            options={brandRoles.map((item) => ({ id: item.brand.id, name: item.brand.name }))}
          />
          <p className="text-sm text-slate-600">{user.email}</p>
          <p className="text-xs uppercase text-slate-500">{role}</p>
          <form action="/auth/logout" method="post" className="mt-1">
            <button className="btn-secondary text-xs" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <DashboardNav isAdmin={globalRole === "admin"} />
      {children}
    </main>
  );
}
