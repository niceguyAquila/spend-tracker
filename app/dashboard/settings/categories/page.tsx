import { CategoryManager } from "@/components/category-manager";
import { getCategories, getSubcategories } from "@/lib/db/queries";
import { requireAllowedRole } from "@/lib/auth";

export default async function CategorySettingsPage() {
  try {
    const { activeBrandId } = await requireAllowedRole(["finance", "admin"]);
    const [categories, subcategories] = await Promise.all([
      getCategories(activeBrandId),
      getSubcategories(activeBrandId)
    ]);

    return <CategoryManager categories={categories} subcategories={subcategories} />;
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
      <section className="card">
        <h2 className="mb-2 text-lg font-semibold">Category setup required</h2>
        <p className="text-sm text-slate-700">
          Category management is unavailable until migrations are applied and RLS policies are active.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Error: {errorText}
        </p>
      </section>
    );
  }
}
