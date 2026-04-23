import { AdminBrandsPanel } from "@/components/admin-brands-panel";
import { requireAllowedUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminBrandsPage() {
  const { globalRole } = await requireAllowedUser();
  if (globalRole !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-4">
      <section className="card">
        <h1 className="text-xl font-semibold">Admin Brand Management</h1>
        <p className="text-sm text-slate-600">Only admins can create and manage brands.</p>
      </section>
      <AdminBrandsPanel />
    </div>
  );
}
