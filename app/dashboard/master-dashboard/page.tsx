import { redirect } from "next/navigation";
import { requireAllowedUser } from "@/lib/auth";
import { DashboardReportTable } from "@/components/dashboard-report-table";
import { MasterDashboardBigBookEntriesTable, MasterDashboardCashflowTable } from "@/components/master-dashboard-tables";
import { PageHeader } from "@/components/ui/page-header";
import { SetupRequiredCard } from "@/components/ui/setup-required-card";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import { formatAmount, getAmountColorClass } from "@/lib/display-format";
import { getBigBookEntries, getBigBookLedgerTypeByCode, getDashboardReportRows } from "@/lib/db/queries";
import {
  buildSpendingNetByMonth,
  buildSpendingPivot,
  partitionSpendingRowsByCurrency,
  partitionSpendingRowsByDirection
} from "@/lib/spending/pivot";

type SearchParamValue = string | string[] | undefined;

type MasterDashboardPageProps = {
  searchParams?: Promise<Record<string, SearchParamValue>>;
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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
  const initialParams = (await searchParams) ?? {};
  const requestedBrandIdRaw = normalizeSingleParam(initialParams.brandId);
  try {
    const { globalRole, activeBrandId, brandRoles } = await requireAllowedUser();
    if (globalRole !== "admin") {
      redirect("/dashboard");
    }

    const resolvedParams = initialParams;
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

    const hasValidLedgerTypeId = Boolean(ledgerType?.id && isUuid(ledgerType.id));

    let spendingRows: Awaited<ReturnType<typeof getDashboardReportRows>> = [];
    try {
      spendingRows = await getDashboardReportRows({ brandId: selectedBrand.id });
    } catch (error) {
      const detail = error instanceof Error ? error.message : JSON.stringify(error);
      throw new Error(
        `[master-dashboard:getDashboardReportRows] brandId=${selectedBrand.id} code=${selectedBrand.code} :: ${detail}`
      );
    }

    let bigBookEntries: Awaited<ReturnType<typeof getBigBookEntries>> = [];
    if (hasValidLedgerTypeId) {
      try {
        bigBookEntries = await getBigBookEntries({
          typeId: [ledgerType!.id],
          dateFrom: dateFrom ?? undefined,
          dateTo: dateTo ?? undefined,
          limit: 500
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : JSON.stringify(error);
        throw new Error(
          `[master-dashboard:getBigBookEntries] typeId=${ledgerType!.id} typeCode=${ledgerType!.code} brand=${selectedBrand.code} :: ${detail}`
        );
      }
    }

    const filteredSpendingRows = spendingRows.filter((row) => {
      const rowMonth = normalizeMonthKey(row.month_key);
      if (monthFrom && rowMonth < monthFrom) return false;
      if (monthTo && rowMonth > monthTo) return false;
      return true;
    });
    const spendingMonthColumns = Array.from(new Set(filteredSpendingRows.map((row) => row.month_key))).sort((a, b) =>
      a.localeCompare(b)
    );
    const spendingCurrencyBlocks = partitionSpendingRowsByCurrency(filteredSpendingRows);
    const unifiedRows: UnifiedCashflowRow[] = [
      ...filteredSpendingRows.map((row) => ({
        source: "web_spending" as const,
        currency: row.currency_code,
        signedAmount: row.entry_direction === "profit" ? Math.abs(row.amount) : -Math.abs(row.amount)
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
        <PageHeader
          title="Master Dashboard"
          description="Dashboard to view combined financial statistics of a brand."
        />

        <section className="card">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <label className="text-sm text-muted">
              <span className="mb-1 block">Brand</span>
              <select className="field min-w-[240px]" name="brandId" defaultValue={selectedBrand.id}>
                {brandRoles.map((role) => (
                  <option key={role.brand_id} value={role.brand_id}>
                    {role.brand.name} ({role.brand.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-muted">
              <span className="mb-1 block">Date From</span>
              <input className="field" type="date" name="dateFrom" defaultValue={dateFrom ?? ""} />
            </label>
            <label className="text-sm text-muted">
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
          <p className="mt-1 text-sm text-muted">
            Unified rule: cash out is negative, cash in is positive. Web Spending and Big Book both contribute inflow
            and outflow based on entry direction.
          </p>
          <StatTileGrid className="mt-4">
            {perCurrency.map((item) => (
              <StatTile
                key={item.currency}
                label={`${item.currency} Net`}
                value={<span className={getAmountColorClass(item.net)}>{formatAmount(item.net)}</span>}
                sublabel={
                  <div className="space-y-1">
                    <p>
                      In:{" "}
                      <span className={getAmountColorClass(item.inflow)}>
                        {item.currency} {formatAmount(item.inflow)}
                      </span>
                    </p>
                    <p>
                      Out:{" "}
                      <span className={getAmountColorClass(-item.outflow)}>
                        {item.currency} {formatAmount(item.outflow)}
                      </span>
                    </p>
                  </div>
                }
              />
            ))}
          </StatTileGrid>

          <MasterDashboardCashflowTable sourceRowsByCurrency={sourceRowsByCurrency} />
        </section>

        {spendingCurrencyBlocks.map(({ currency, rows }) => {
          const { outflowRows, inflowRows } = partitionSpendingRowsByDirection(rows);
          const outflowPivot = buildSpendingPivot(outflowRows, spendingMonthColumns);
          const inflowPivot = buildSpendingPivot(inflowRows, spendingMonthColumns);
          const spendingNetByMonth = buildSpendingNetByMonth(
            inflowPivot.monthGrandTotals,
            outflowPivot.monthGrandTotals,
            spendingMonthColumns
          );
          return (
            <div key={currency} className="space-y-4">
              <DashboardReportTable
                title={`Web Spending ${currency} Outflow (${selectedBrand.name})`}
                description="Expense outflows grouped by category across available months."
                currencyCode={currency}
                monthColumns={spendingMonthColumns}
                rows={outflowPivot.pivotRows}
                monthGrandTotals={outflowPivot.monthGrandTotals}
              />
              <DashboardReportTable
                title={`Web Spending ${currency} Inflow (${selectedBrand.name})`}
                description="Expense inflows grouped by category across available months."
                currencyCode={currency}
                monthColumns={spendingMonthColumns}
                rows={inflowPivot.pivotRows}
                monthGrandTotals={inflowPivot.monthGrandTotals}
                netRow={spendingNetByMonth}
                netRowLabel="Net (Inflow − Outflow)"
              />
            </div>
          );
        })}

        <section className="card">
          <h2 className="text-lg font-semibold">Big Book Ledger for Brand Type</h2>
          <p className="mt-1 text-sm text-muted">
            Mapping rule: <code>{selectedBrand.code}</code> brand code must equal Big Book ledger type code.
          </p>
          {!ledgerType || !hasValidLedgerTypeId ? (
            <div className="mt-3 rounded-md border border-[rgb(var(--warning)/0.35)] bg-[rgb(var(--warning)/0.12)] px-3 py-2 text-sm text-[rgb(var(--warning))]">
              <p>
                No valid Big Book ledger type mapping is available for brand code <strong>{selectedBrand.code}</strong>.
              </p>
              {ledgerType ? (
                <p className="mt-1 text-xs">
                  Resolved type: <strong>{ledgerType.code}</strong> ({ledgerType.name}) with id{" "}
                  <code>{ledgerType.id}</code>. Expected a UUID id.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Showing type: <strong>{ledgerType.code}</strong> - {ledgerType.name}
            </p>
          )}

          {ledgerType ? <MasterDashboardBigBookEntriesTable entries={bigBookEntries} /> : null}
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

    const uuidDiagnostic = errorText.includes("invalid input syntax for type uuid")
      ? ` Diagnostic: a non-UUID value was used where UUID is required. Requested brandId from URL is ${
          requestedBrandIdRaw ?? "(empty)"
        }. If this is not a UUID, remove the \`brandId\` query param or choose a valid brand from the brand selector.`
      : "";

    return (
      <SetupRequiredCard
        title="Master Dashboard setup required"
        message={`The app cannot read required tables yet. Apply SQL migrations in \`supabase/migrations\` and refresh.${uuidDiagnostic}`}
        error={errorText}
      />
    );
  }
}
