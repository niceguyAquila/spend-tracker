import { AdminUsersPanel } from "@/components/admin-users-panel";
import { requireAllowedUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminUsersPage() {
  const { globalRole } = await requireAllowedUser();
  if (globalRole !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <h1 className="text-xl font-semibold">User Access and Role Administration</h1>
        <p className="text-sm text-muted">
          Invite users, set access role, assign brand access, and manage account status/password access.
        </p>
      </section>
      <AdminUsersPanel />
    </div>
  );
}
