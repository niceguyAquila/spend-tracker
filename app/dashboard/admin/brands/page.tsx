import { AdminBrandsPanel } from "@/components/admin-brands-panel";
import { PageHeader } from "@/components/ui/page-header";
import { requireAllowedUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminBrandsPage() {
  const { globalRole } = await requireAllowedUser();
  if (globalRole !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Brand Configuration Administration"
        description="Only admins can create and manage brands."
      />
      <AdminBrandsPanel />
    </div>
  );
}
