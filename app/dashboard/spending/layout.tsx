import { SpendingSubNav } from "@/components/spending-sub-nav";
import { requireAllowedUser } from "@/lib/auth";

export default async function SpendingLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { role } = await requireAllowedUser();
  return (
    <div className="space-y-6">
      <SpendingSubNav canManageCategories={role === "finance" || role === "admin"} />
      {children}
    </div>
  );
}
