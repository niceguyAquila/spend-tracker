import { DashboardNav } from "@/components/dashboard-nav";
import { requireAllowedUser } from "@/lib/auth";

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { user, role } = await requireAllowedUser();

  return (
    <main className="mx-auto min-h-screen max-w-7xl p-6">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">ZenPlay Spend Tracker</h1>
          <p className="text-sm text-slate-600">
            Monthly operations spending dashboard and data entry workspace.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-600">{user.email}</p>
          <p className="text-xs uppercase text-slate-500">{role}</p>
          <form action="/auth/logout" method="post" className="mt-1">
            <button className="btn-secondary text-xs" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <DashboardNav isAdmin={role === "admin"} />
      {children}
    </main>
  );
}
