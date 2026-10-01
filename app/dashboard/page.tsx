import { redirect } from "next/navigation";
import { requireAllowedUser } from "@/lib/auth";

export default async function DashboardPage() {
  const { globalRole } = await requireAllowedUser();
  if (globalRole === "admin") {
    redirect("/dashboard/big-book");
  }

  return (
    <main className="p-6">
      <p className="text-sm text-muted">This workspace is limited to administrators.</p>
    </main>
  );
}
