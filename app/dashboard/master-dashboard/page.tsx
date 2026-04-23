import { redirect } from "next/navigation";
import { Fragment } from "react";
import { requireAllowedUser } from "@/lib/auth";
import { DashboardReportTable } from "@/components/dashboard-report-table";
import { formatAmount, formatDateDisplay, getAmountColorClass } from "@/lib/display-format";
import { getBigBookEntries, getBigBookLedgerTypeByCode, getDashboardReportRows } from "@/lib/db/queries";

type SearchParamValue = string | string[] | undefined;

type MasterDashboardPageProps = {
  searchParams?: Promise<Record<string, SearchParamValue>>;
};

type PivotRow = {
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  byMonth: Record<string, number>;
  subtotal: number;
};

type UnifiedCashflowRow = {
  source: "web_spending" | "big_book";
  currency: "IDR" | "MYR" | "USDT" | "TRX";
  signedAmount: number;
};

type CashflowSummary = {
  inflow: number;
  outflow: number;
  net: number;
};

function normalizeSingleParam(param: SearchParamValue): string | null {
  if (!param) return null;
  if (Array.isArray(param)) return param[0] ?? null;
  return param;
}

function normalizeDateParam(param: SearchParamValue): string | null {
  const value = normalizeSingleParam(param)?.trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function normalizeMonthKey(value: string): string {
  return value.slice(0, 7);
}

function buildSpendingPivotRows(rows: Awaited<ReturnType<typeof getDashboardReportRows>>) {
  const monthColumns = Array.from(new Set(rows.map((row) => row.month_key))).sort((a, b) => a.localeCompare(b));
  const groupedRows = new Map<string, PivotRow>();

  for (const row of rows) {
    const key = `${row.category_id}:${row.subcategory_id}`;
    const existing = groupedRows.get(key);
    if (!existing) {
      const byMonth = Object.fromEntries(monthColumns.map((monthKey) => [monthKey, 0]));
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

  const monthGrandTotals = Object.fromEntries(monthColumns.map((monthKey) => [monthKey, 0])) as Record<string, number>;
  const categorySubtotals: Record<string, { byMonth: Record<string, number>; subtotal: number }> = {};

  for (const row of pivotRows) {
    if (!categorySubtotals[row.categoryId]) {
      categorySubtotals[row.categoryId] = {
        byMonth: Object.fromEntries(monthColumns.map((monthKey) => [monthKey, 0])),
        subtotal: 0
      };
    }

    for (const monthKey of monthColumns) {
      categorySubtotals[row.categoryId].byMonth[monthKey] += row.byMonth[monthKey] ?? 0;
      monthGrandTotals[monthKey] += row.byMonth[monthKey] ?? 0;
    }
    categorySubtotals[row.categoryId].subtotal += row.subtotal;
  }

  return { monthColumns, pivotRows, categorySubtotals, monthGrandTotals };
}

function buildCashflowSummary(rows: UnifiedCashflowRow[]): CashflowSummary {
  let inflow = 0;
  let outflow = 0;
  for (const row of rows) {
    if (row.signedAmount >= 0) {
      inflow += row.signedAmount;
    } else {
      outflow += Math.abs(row.signedAmount);
    }
  }
  return {
    inflow,
    outflow,
    net: inflow - outflow
  };
}

export default async function MasterDashboardPage({ searchParams }: MasterDashboardPageProps) {
  try {
    const { globalRole, activeBrandId, brandRoles } = await requireAllowedUser();
    if (globalRole !== "admin") {
      redirect("/dashboard");
    }

    const resolvedParams = (await searchParams) ?? {};
    const requestedBrandId = normalizeSingleParam(resolvedParams.brandId);
    const dateFrom = normalizeDateParam(resolvedParams.dateFrom);
    const dateTo = normalizeDateParam(resolvedParams.dateTo);
    const monthFrom = dateFrom ? dateFrom.slice(0, 7) : null;
    const monthTo = dateTo ? dateTo.slice(0, 7) : null;
    const selectedBrandRole =
      brandRoles.find((row) => row.brand_id === requestedBrandId) ??
      brandRoles.find((row) => row.brand_id === activeBrandId) ??
      brandRoles[0];

    const selectedBrand = selectedBrandRole.brand;
    const ledgerType = await getBigBookLedgerTypeByCode(selectedBrand.code, { includeInactive: true });

    const [spendingRows, bigBookEntries] = await Promise.all([
      getDashboardReportRows({ brandId: selectedBrand.id }),
      ledgerType
        ? getBigBookEntries(selectedBrand.id, {
            typeId: ledgerType.id,
            dateFrom: dateFrom ?? undefined,
            dateTo: dateTo ?? undefined,
            limit: 500
          })
        : Promise.resolve([])
    ]);

    const filteredSpendingRows = spendingRows.filter((row) => {
      const rowMonth = normalizeMonthKey(row.month_key);
      if (monthFrom && rowMonth < monthFrom) return false;
      if (monthTo && rowMonth > monthTo) return false;
      return true;
    });
    const spendingPivot = buildSpendingPivotRows(filteredSpendingRows);
    const unifiedRows: UnifiedCashflowRow[] = [
      ...filteredSpendingRows.map((row) => ({
        source: "web_spending" as const,
        currency: "IDR" as const,
        signedAmount: -Math.abs(row.amount)
      })),
      ...bigBookEntries.map((entry) => ({
        source: "big_book" as const,
        currency: entry.currency_code,
        signedAmount: entry.entry_direction === "profit" ? Math.abs(entry.amount) : -Math.abs(entry.amount)
      }))
    ];
    const currencies: Array<UnifiedCashflowRow["currency"]> = ["IDR", "MYR", "USDT", "TRX"];
    const perCurrency = currencies.map((currency) => ({
      currency,
      ...buildCashflowSummary(unifiedRows.filter((row) => row.currency === currency))
    }));
    const sourceRowsByCurrency = currencies.map((currency) => ({
      currency,
      webSpending: buildCashflowSummary(
        unifiedRows.filter((row) => row.currency === currency && row.source === "web_spending")
      ),
      bigBook: buildCashflowSummary(unifiedRows.filter((row) => row.currency === currency && row.source === "big_book")),
      combined: buildCashflowSummary(unifiedRows.filter((row) => row.currency === currency))
    }));

    return (
      <div className="space-y-6">
        <section className="card">
          <h1 className="text-xl font-semibold">Master Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">
            Unified admin view for Web Spending and Big Book Type Ledger by selected brand.
          </p>
          <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block">Brand</span>
              <select className="field min-w-[240px]" name="brandId" defaultValue={selectedBrand.id}>
                {brandRoles.map((role) => (
                  <option key={role.brand_id} value={role.brand_id}>
                    {role.brand.name} ({role.brand.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block">Date From</span>
              <input className="field" type="date" name="dateFrom" defaultValue={dateFrom ?? ""} />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block">Date To</span>
              <input className="field" type="date" name="dateTo" defaultValue={dateTo ?? ""} />
            </label>
            <button className="btn" type="submit">
              Apply Filter
            </button>
            <a className="btn-secondary" href="/dashboard/master-dashboard">
              Reset Filter
            </a>
          </form>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Aggregated Cashflow (Web Spending + Big Book)</h2>
          <p className="mt-1 text-sm text-slate-600">
            Unified rule: cash out is negative, cash in is positive. Web Spending contributes to outflow; Big Book
            contributes both inflow and outflow.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
            {perCurrency.map((item) => (
              <article key={item.currency} className="rounded-md border border-slate-200 p-3">
                <p className="text-sm font-semibold">{item.currency}</p>
                <div className="mt-2 space-y-1 text-sm">
                  <p>
                    <span className="text-slate-500">In:</span>{" "}
                    <span className={getAmountColorClass(item.inflow)}>
                      {item.currency} {formatAmount(item.inflow)}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-500">Out:</span>{" "}
                    <span className={getAmountColorClass(-item.outflow)}>
                      {item.currency} {formatAmount(item.outflow)}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-500">Net:</span>{" "}
                    <span className={getAmountColorClass(item.net)}>
                      {item.currency} {formatAmount(item.net)}
                    </span>
                  </p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Currency</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Inflow</th>
                  <th className="px-3 py-2">Outflow</th>
                  <th className="px-3 py-2">Net</th>
                </tr>
              </thead>
              <tbody>
                {sourceRowsByCurrency.map((row) => (
                  <Fragment key={row.currency}>
                    <tr className="border-b">
                      <td className="px-3 py-2">{row.currency}</td>
                      <td className="px-3 py-2">Web Spending</td>
                      <td className="px-3 py-2">
                        {row.currency} {formatAmount(row.webSpending.inflow)}
                      </td>
                      <td className="px-3 py-2">
                        {row.currency} {formatAmount(row.webSpending.outflow)}
                      </td>
                      <td className={`px-3 py-2 ${getAmountColorClass(row.webSpending.net)}`}>
                        {row.currency} {formatAmount(row.webSpending.net)}
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-3 py-2">{row.currency}</td>
                      <td className="px-3 py-2">Big Book</td>
                      <td className="px-3 py-2">
                        {row.currency} {formatAmount(row.bigBook.inflow)}
                      </td>
                      <td className="px-3 py-2">
                        {row.currency} {formatAmount(row.bigBook.outflow)}
                      </td>
                      <td className={`px-3 py-2 ${getAmountColorClass(row.bigBook.net)}`}>
                        {row.currency} {formatAmount(row.bigBook.net)}
                      </td>
                    </tr>
                    <tr className="border-b bg-slate-50">
                      <td className="px-3 py-2">{row.currency}</td>
                      <td className="px-3 py-2 font-semibold">Combined</td>
                      <td className="px-3 py-2 font-semibold">
                        {row.currency} {formatAmount(row.combined.inflow)}
                      </td>
                      <td className="px-3 py-2 font-semibold">
                        {row.currency} {formatAmount(row.combined.outflow)}
                      </td>
                      <td className={`px-3 py-2 font-semibold ${getAmountColorClass(row.combined.net)}`}>
                        {row.currency} {formatAmount(row.combined.net)}
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Web Spending Metrics ({selectedBrand.name})</h2>
          <p className="mt-1 text-sm text-slate-600">
            Data source: expense entries grouped by category and sub-category across available months.
          </p>
        </section>

        <DashboardReportTable
          monthColumns={spendingPivot.monthColumns}
          rows={spendingPivot.pivotRows}
          categorySubtotals={spendingPivot.categorySubtotals}
          monthGrandTotals={spendingPivot.monthGrandTotals}
        />

        <section className="card">
          <h2 className="text-lg font-semibold">Big Book Ledger for Brand Type</h2>
          <p className="mt-1 text-sm text-slate-600">
            Mapping rule: <code>{selectedBrand.code}</code> brand code must equal Big Book ledger type code.
          </p>
          {!ledgerType ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No Big Book ledger type matches brand code <strong>{selectedBrand.code}</strong>.
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-700">
              Showing type: <strong>{ledgerType.code}</strong> - {ledgerType.name}
            </p>
          )}

          {ledgerType ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Cash Flow</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Explanation</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {bigBookEntries.map((entry) => (
                    <tr key={entry.id} className="border-b">
                      <td className="px-3 py-2">{formatDateDisplay(entry.entry_date)}</td>
                      <td className="px-3 py-2">{entry.entry_direction === "profit" ? "In" : "Out"}</td>
                      <td className="px-3 py-2">{entry.type_name}</td>
                      <td className="px-3 py-2">{entry.explanation}</td>
                      <td className={`px-3 py-2 ${getAmountColorClass(entry.entry_direction === "spending" ? -entry.amount : entry.amount)}`}>
                        {entry.currency_code} {formatAmount(entry.amount, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </td>
                      <td className="px-3 py-2">{entry.actor_display_name}</td>
                    </tr>
                  ))}
                  {!bigBookEntries.length ? (
                    <tr>
                      <td className="px-3 py-4 text-center text-slate-600" colSpan={6}>
                        No Big Book entries found for this brand type mapping.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
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
        <h2 className="mb-2 text-lg font-semibold">Master Dashboard setup required</h2>
        <p className="text-sm text-slate-700">
          The app cannot read required tables yet. Apply SQL migrations in `supabase/migrations` and refresh.
        </p>
        <p className="mt-2 text-xs text-slate-500">Error: {errorText}</p>
      </section>
    );
  }
}
