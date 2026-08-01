import type { Metadata } from "next";
import { DashboardReportFilters } from "@/components/dashboard-report-filters";
import { DashboardReportTable } from "@/components/dashboard-report-table";
import { PageHeader } from "@/components/ui/page-header";
import { SetupRequiredCard } from "@/components/ui/setup-required-card";
import { getCategories, getDashboardReportRows, getSubcategories } from "@/lib/db/queries";
import { requireAllowedUser } from "@/lib/auth";
import {
  buildSpendingNetByMonth,
  buildSpendingPivot,
  partitionSpendingRowsByDirection
} from "@/lib/spending/pivot";

type SearchParamValue = string | string[] | undefined;

type DashboardPageProps = {
  searchParams?: Promise<Record<string, SearchParamValue>>;
};

export async function generateMetadata(): Promise<Metadata> {
  const { activeBrand } = await requireAllowedUser();
  return {
    title: `${activeBrand.name} - Web Spending Overview`
  };
}

function normalizeArrayParam(param: SearchParamValue): string[] {
  if (!param) return [];
  const raw = Array.isArray(param) ? param : [param];
  return raw.map((item) => item.trim()).filter(Boolean);
}

function normalizeSingleParam(param: SearchParamValue): string | null {
  const values = normalizeArrayParam(param);
  return values[0] ?? null;
}

export default async function SpendingOverviewPage({ searchParams }: DashboardPageProps) {
  try {
    const { activeBrandId } = await requireAllowedUser();
    const resolvedParams = (await searchParams) ?? {};
    const selectedCategoryIds = normalizeArrayParam(resolvedParams.category);
    const selectedSubcategoryIds = normalizeArrayParam(resolvedParams.subcategory);
    const monthFromRaw = normalizeSingleParam(resolvedParams.monthFrom);
    const monthToRaw = normalizeSingleParam(resolvedParams.monthTo);

    const [categories, subcategories, allReportRows] = await Promise.all([
      getCategories(activeBrandId),
      getSubcategories(activeBrandId),
      getDashboardReportRows({ brandId: activeBrandId })
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
      if (validSelectedSubcategoryIds.length && !validSelectedSubcategoryIds.includes(row.subcategory_id)) {
        return false;
      }
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
    const rangeHasNoOverlap = rangeApplied && !activeMonthColumns.length && monthOptions.length > 0;

    const filteredRows = baseRows.filter((row) => {
      if (activeMonthColumns.length && !activeMonthColumns.includes(row.month_key)) return false;
      return true;
    });

    const { outflowRows, inflowRows } = partitionSpendingRowsByDirection(filteredRows);
    const outflowPivot = buildSpendingPivot(outflowRows, activeMonthColumns);
    const inflowPivot = buildSpendingPivot(inflowRows, activeMonthColumns);
    const netByMonth = buildSpendingNetByMonth(
      inflowPivot.monthGrandTotals,
      outflowPivot.monthGrandTotals,
      activeMonthColumns
    );

    const filterKey = [
      validSelectedCategoryIds.join(","),
      validSelectedSubcategoryIds.join(","),
      rangeStart ?? "",
      rangeEnd ?? ""
    ].join("|");

    return (
      <div className="space-y-6">
        <PageHeader title="Spending Overview" description="Monthly and category spending reports." />

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
          <p className="rounded-md border border-[rgb(var(--warning)/0.35)] bg-[rgb(var(--warning)/0.12)] px-3 py-2 text-sm text-[rgb(var(--warning))]">
            No months fall in the selected range for the current category filters. Adjust From/To or clear the month
            range.
          </p>
        ) : null}

        <DashboardReportTable
          title="Outflow"
          description="Cash leaving the brand (spending)."
          monthColumns={activeMonthColumns}
          rows={outflowPivot.pivotRows}
          categorySubtotals={outflowPivot.categorySubtotals}
          monthGrandTotals={outflowPivot.monthGrandTotals}
        />

        <DashboardReportTable
          title="Inflow"
          description="Cash entering the brand (profit)."
          monthColumns={activeMonthColumns}
          rows={inflowPivot.pivotRows}
          categorySubtotals={inflowPivot.categorySubtotals}
          monthGrandTotals={inflowPivot.monthGrandTotals}
          netRow={netByMonth}
          netRowLabel="Net (Inflow − Outflow)"
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
        title="Dashboard setup required"
        message="The app cannot read spending tables yet. Apply SQL migrations in `supabase/migrations` and refresh."
        error={errorText}
      />
    );
  }
}
