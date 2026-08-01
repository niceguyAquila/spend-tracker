import type { Metadata } from "next";
import { TransactionForm } from "@/components/transaction-form";
import { TransactionTable } from "@/components/transaction-table";
import { PageHeader } from "@/components/ui/page-header";
import { SetupRequiredCard } from "@/components/ui/setup-required-card";
import { getCategories, getExpenseMonthKeys, getExpenses, getSubcategories } from "@/lib/db/queries";
import { requireAllowedUser } from "@/lib/auth";

type SearchParamValue = string | string[] | undefined;

type SpendingEntriesPageProps = {
  searchParams?: Promise<Record<string, SearchParamValue>>;
};

function normalizeSingleParam(param: SearchParamValue): string | null {
  if (!param) return null;
  if (Array.isArray(param)) return param[0]?.trim() || null;
  const normalized = param.trim();
  return normalized.length ? normalized : null;
}

function getCurrentMonthKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const { activeBrand } = await requireAllowedUser();
  return {
    title: `${activeBrand.name} - Add Spending`
  };
}

export default async function SpendingEntriesPage({ searchParams }: SpendingEntriesPageProps) {
  try {
    const { activeBrandId, role } = await requireAllowedUser();
    const resolvedParams = (await searchParams) ?? {};
    const selectedMonth = normalizeSingleParam(resolvedParams.month);

    const [categories, subcategories, fetchedMonthOptions] = await Promise.all([
      getCategories(activeBrandId),
      getSubcategories(activeBrandId),
      getExpenseMonthKeys(activeBrandId)
    ]);

    const fallbackMonth = getCurrentMonthKey();
    const monthOptions = fetchedMonthOptions.length ? fetchedMonthOptions : [fallbackMonth];
    const activeMonth =
      selectedMonth && monthOptions.includes(selectedMonth) ? selectedMonth : monthOptions[0] ?? fallbackMonth;

    const rows = await getExpenses({
      brandId: activeBrandId,
      month: fetchedMonthOptions.length ? activeMonth : undefined,
      limit: 2000
    });

    return (
      <div className="space-y-6">
        <PageHeader title="Spending Entries" description="Create and manage spending transactions." />

        {(role === "finance" || role === "admin") ? (
          <TransactionForm categories={categories} subcategories={subcategories} submitLabel="Add Spending" />
        ) : (
          <section className="card">
            <h2 className="text-lg font-semibold">Quick Add Transaction</h2>
            <p className="mt-2 text-sm text-muted">
              Viewer role can view spending data, but only finance/admin can create new spending records.
            </p>
          </section>
        )}

        <TransactionTable
          rows={rows}
          categories={categories}
          subcategories={subcategories}
          activeMonth={activeMonth}
          monthOptions={monthOptions}
          role={role}
        />
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
        title="Spending entries setup required"
        message="The app cannot read spending tables yet. Apply SQL migrations in `supabase/migrations` and refresh."
        error={errorText}
      />
    );
  }
}
