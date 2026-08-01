import { CategoryManager } from "@/components/category-manager";
import { PageHeader } from "@/components/ui/page-header";
import { SetupRequiredCard } from "@/components/ui/setup-required-card";
import { getCategories, getExpenseStaff, getExpenseTypes } from "@/lib/db/queries";
import { requireAllowedRole } from "@/lib/auth";

export default async function CategorySettingsPage() {
  try {
    const { activeBrandId } = await requireAllowedRole(["finance", "admin"]);
    const [categories, types, staff] = await Promise.all([
      getCategories(activeBrandId, { includeInactive: true }),
      getExpenseTypes(activeBrandId, { includeInactive: true }),
      getExpenseStaff(activeBrandId, { includeInactive: true })
    ]);

    return (
      <div className="space-y-6">
        <PageHeader
          title="Categories"
          description="Manage spending categories, types, and staff."
        />
        <CategoryManager categories={categories} types={types} staff={staff} />
      </div>
    );
  } catch (error) {
    let errorText = "Unknown database error";
    if (error instanceof Error) {
      errorText = error.message;
    } else {
      try {
        errorText = JSON.stringify(error);
      } catch {
        errorText = "Unknown database error";
      }
    }

    return (
      <SetupRequiredCard
        title="Category setup required"
        message="Category management is unavailable until migrations are applied and RLS policies are active."
        error={errorText}
      />
    );
  }
}
