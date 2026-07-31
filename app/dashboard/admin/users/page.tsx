import { AdminUsersPanel } from "@/components/admin-users-panel";
import { PageHeader } from "@/components/ui/page-header";
import { requireAllowedUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminUsersPage() {
  const { globalRole } = await requireAllowedUser();
  if (globalRole !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Access and Role Administration"
        description="Invite users, set access role, assign brand access, and manage account status/password access."
      />
      <AdminUsersPanel />
    </div>
  );
}
