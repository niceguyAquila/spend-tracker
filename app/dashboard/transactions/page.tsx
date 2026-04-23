import { TransactionForm } from "@/components/transaction-form";
import { TransactionTable } from "@/components/transaction-table";
import { getCategories, getExpenseMonthKeys, getExpenses, getSubcategories } from "@/lib/db/queries";
import { requireAllowedRole } from "@/lib/auth";

type SearchParamValue = string | string[] | undefined;

type TransactionsPageProps = {
  searchParams?: Promise<Record<string, SearchParamValue>>;
};

function getMonthKeyForDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function normalizeSingleParam(param: SearchParamValue): string | null {
  if (!param) return null;
  if (Array.isArray(param)) return param[0]?.trim() || null;
  const normalized = param.trim();
  return normalized.length ? normalized : null;
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  try {
    const { activeBrandId } = await requireAllowedRole(["finance", "admin"]);
    const resolvedParams = (await searchParams) ?? {};

    const [categories, subcategories, monthKeys] = await Promise.all([
      getCategories(activeBrandId),
      getSubcategories(activeBrandId),
      getExpenseMonthKeys(activeBrandId)
    ]);

    const currentMonthKey = getMonthKeyForDate(new Date());
    const selectedMonth = normalizeSingleParam(resolvedParams.month);
    const monthKeySet = new Set(monthKeys);
    const activeMonth = selectedMonth && monthKeySet.has(selectedMonth) ? selectedMonth : currentMonthKey;
    const monthOptions = monthKeySet.has(currentMonthKey) ? monthKeys : [currentMonthKey, ...monthKeys];

    const expenses = await getExpenses({ brandId: activeBrandId, month: activeMonth, limit: 500 });

    return (
      <div className="space-y-4">
        <TransactionForm categories={categories} subcategories={subcategories} />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card xl:col-span-2">
          <h2 className="mb-2 text-lg font-semibold">Last 10 Entries</h2>
          <ul className="space-y-1 text-sm">
            {expenses.slice(0, 10).map((item) => (
              <li key={item.id} className="flex items-center justify-between border-b py-1">
                <span>
                  {item.expense_date} - {item.category_name} / {item.subcategory_name}
                </span>
                <span>Rp {item.amount.toLocaleString("id-ID")}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2 className="mb-2 text-lg font-semibold">Duplicate Watch</h2>
          <p className="text-sm text-slate-600">
            Duplicate candidates are detected by same date, amount, category, sub-category, note, and reference.
          </p>
        </div>
      </section>

        <TransactionTable
          rows={expenses}
          categories={categories}
          subcategories={subcategories}
          activeMonth={activeMonth}
          monthOptions={monthOptions}
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
      <section className="card">
        <h2 className="mb-2 text-lg font-semibold">Transactions setup required</h2>
        <p className="text-sm text-slate-700">
          The app cannot read/write transactions yet. Apply SQL migrations and check your Supabase env keys.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Error: {errorText}
        </p>
      </section>
    );
  }
}
