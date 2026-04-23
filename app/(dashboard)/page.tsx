import { DashboardReportFilters } from "@/components/dashboard-report-filters";
import { DashboardReportTable } from "@/components/dashboard-report-table";
import {
  getCategories,
  getDashboardReportRows,
  getSubcategories,
} from "@/lib/db/queries";

type SearchParamValue = string | string[] | undefined;

type DashboardPageProps = {
  searchParams?: Promise<Record<string, SearchParamValue>>;
};

function normalizeArrayParam(param: SearchParamValue): string[] {
  if (!param) return [];
  const raw = Array.isArray(param) ? param : [param];
  return raw.map((item) => item.trim()).filter(Boolean);
}

function normalizeSingleParam(param: SearchParamValue): string | null {
  const values = normalizeArrayParam(param);
  return values[0] ?? null;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  try {
    const resolvedParams = (await searchParams) ?? {};
    const selectedCategoryIds = normalizeArrayParam(resolvedParams.category);
    const selectedSubcategoryIds = normalizeArrayParam(resolvedParams.subcategory);
    const monthFromRaw = normalizeSingleParam(resolvedParams.monthFrom);
    const monthToRaw = normalizeSingleParam(resolvedParams.monthTo);

    const [categories, subcategories, allReportRows] = await Promise.all([
      getCategories(),
      getSubcategories(),
      getDashboardReportRows()
    ]);

    const categoryIdSet = new Set(categories.map((item) => item.id));
    const validSelectedCategoryIds = selectedCategoryIds.filter((id) => categoryIdSet.has(id));

    const scopedSubcategories = validSelectedCategoryIds.length
      ? subcategories.filter((item) => validSelectedCategoryIds.includes(item.category_id))
      : subcategories;
    const filteredSubcategories = scopedSubcategories.filter(
      (item) => item.name.trim().toLowerCase() !== "select sub-category"
    );
    const subcategoryIdSet = new Set(filteredSubcategories.map((item) => item.id));
    const validSelectedSubcategoryIds = selectedSubcategoryIds.filter((id) => subcategoryIdSet.has(id));

    const baseRows = allReportRows.filter((row) => {
      if (validSelectedCategoryIds.length && !validSelectedCategoryIds.includes(row.category_id)) return false;
      if (validSelectedSubcategoryIds.length && !validSelectedSubcategoryIds.includes(row.subcategory_id)) return false;
      return true;
    });

    const monthOptions = Array.from(new Set(baseRows.map((row) => row.month_key))).sort((a, b) =>
      a.localeCompare(b)
    );
    const monthKeySet = new Set(monthOptions);

    let rangeStart = monthFromRaw && monthKeySet.has(monthFromRaw) ? monthFromRaw : null;
    let rangeEnd = monthToRaw && monthKeySet.has(monthToRaw) ? monthToRaw : null;
    if (rangeStart && rangeEnd && rangeStart > rangeEnd) {
      const swap = rangeStart;
      rangeStart = rangeEnd;
      rangeEnd = swap;
    }

    const activeMonthColumns = monthOptions.filter((monthKey) => {
      if (rangeStart && monthKey < rangeStart) return false;
      if (rangeEnd && monthKey > rangeEnd) return false;
      return true;
    });

    const rangeApplied = Boolean(monthFromRaw || monthToRaw);
    const rangeHasNoOverlap =
      rangeApplied && !activeMonthColumns.length && monthOptions.length > 0;

    const filteredRows = baseRows.filter((row) => {
      if (activeMonthColumns.length && !activeMonthColumns.includes(row.month_key)) return false;
      return true;
    });

    const groupedRows = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        subcategoryId: string;
        subcategoryName: string;
        byMonth: Record<string, number>;
        subtotal: number;
      }
    >();

    for (const row of filteredRows) {
      const key = `${row.category_id}:${row.subcategory_id}`;
      const existing = groupedRows.get(key);
      if (!existing) {
        const byMonth = Object.fromEntries(activeMonthColumns.map((monthKey) => [monthKey, 0]));
        byMonth[row.month_key] = row.amount;
        groupedRows.set(key, {
          categoryId: row.category_id,
          categoryName: row.category_name,
          subcategoryId: row.subcategory_id,
          subcategoryName: row.subcategory_name,
          byMonth,
          subtotal: row.amount
        });
        continue;
      }

      existing.byMonth[row.month_key] = (existing.byMonth[row.month_key] ?? 0) + row.amount;
      existing.subtotal += row.amount;
    }

    const pivotRows = [...groupedRows.values()].sort((a, b) => {
      if (a.categoryName !== b.categoryName) return a.categoryName.localeCompare(b.categoryName);
      return a.subcategoryName.localeCompare(b.subcategoryName);
    });

    const monthGrandTotals = Object.fromEntries(activeMonthColumns.map((monthKey) => [monthKey, 0])) as Record<
      string,
      number
    >;
    for (const row of pivotRows) {
      for (const monthKey of activeMonthColumns) {
        monthGrandTotals[monthKey] += row.byMonth[monthKey] ?? 0;
      }
    }
    const categorySubtotals: Record<string, { byMonth: Record<string, number>; subtotal: number }> = {};
    for (const row of pivotRows) {
      if (!categorySubtotals[row.categoryId]) {
        categorySubtotals[row.categoryId] = {
          byMonth: Object.fromEntries(activeMonthColumns.map((monthKey) => [monthKey, 0])),
          subtotal: 0
        };
      }
      for (const monthKey of activeMonthColumns) {
        categorySubtotals[row.categoryId].byMonth[monthKey] += row.byMonth[monthKey] ?? 0;
      }
      categorySubtotals[row.categoryId].subtotal += row.subtotal;
    }

    const filterKey = [
      validSelectedCategoryIds.join(","),
      validSelectedSubcategoryIds.join(","),
      rangeStart ?? "",
      rangeEnd ?? ""
    ].join("|");

    return (
      <div className="space-y-4">
        <DashboardReportFilters
          key={filterKey}
          categories={categories.map((item) => ({ value: item.id, label: item.name }))}
          subcategories={filteredSubcategories.map((item) => ({
            value: item.id,
            label: item.name,
            categoryId: item.category_id
          }))}
          months={monthOptions.map((monthKey) => ({
            value: monthKey,
            label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
              new Date(`${monthKey}T00:00:00`)
            )
          }))}
          selectedCategoryIds={validSelectedCategoryIds}
          selectedSubcategoryIds={validSelectedSubcategoryIds}
          selectedMonthFrom={rangeStart}
          selectedMonthTo={rangeEnd}
        />

        {rangeHasNoOverlap ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No months fall in the selected range for the current category filters. Adjust From/To or clear the month
            range.
          </p>
        ) : null}

        <DashboardReportTable
          monthColumns={activeMonthColumns}
          rows={pivotRows}
          categorySubtotals={categorySubtotals}
          monthGrandTotals={monthGrandTotals}
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
        <h2 className="mb-2 text-lg font-semibold">Dashboard setup required</h2>
        <p className="text-sm text-slate-700">
          The app cannot read spending tables yet. Apply SQL migrations in `supabase/migrations` and refresh.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Error: {errorText}
        </p>
      </section>
    );
  }
}
