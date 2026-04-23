import { AdminUsersPanel } from "@/components/admin-users-panel";
import { requireAllowedRole } from "@/lib/auth";

export default async function AdminUsersPage() {
  await requireAllowedRole(["admin"]);

  return (
    <div className="space-y-4">
      <section className="card">
        <h1 className="text-xl font-semibold">Admin User Management</h1>
        <p className="text-sm text-slate-600">
          Invite users, set their role, and control active access.
        </p>
      </section>
      <AdminUsersPanel />
    </div>
  );
}
