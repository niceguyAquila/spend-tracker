import { WebTransactionImport } from "@/components/web-transaction-import";
import { WebTransactionsFilters } from "@/components/web-transactions-filters";
import { WebTransactionsTable } from "@/components/web-transactions-table";
import { PageHeader } from "@/components/ui/page-header";
import { SetupRequiredCard } from "@/components/ui/setup-required-card";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import { buildWebTransactionMetrics, getWebTransactions } from "@/lib/db/queries";
import { requireAllowedUser } from "@/lib/auth";
import { formatAmount, getAmountColorClass } from "@/lib/display-format";

type SearchParamValue = string | string[] | undefined;

type TransactionsPageProps = {
  searchParams?: Promise<Record<string, SearchParamValue>>;
};
type SourceSystem = "backoffice" | "payment_gateway";

function normalizeSingleParam(param: SearchParamValue): string | null {
  if (!param) return null;
  if (Array.isArray(param)) return param[0]?.trim() || null;
  const normalized = param.trim();
  return normalized.length ? normalized : null;
}

function normalizeSourceSystem(param: SearchParamValue): SourceSystem {
  const value = normalizeSingleParam(param);
  return value === "backoffice" ? "backoffice" : "payment_gateway";
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  try {
    const { activeBrandId, role } = await requireAllowedUser();
    const resolvedParams = (await searchParams) ?? {};
    const sourceSystem = normalizeSourceSystem(resolvedParams.source);
    const status = normalizeSingleParam(resolvedParams.status);
    const canonicalType = normalizeSingleParam(resolvedParams.canonicalType);
    const merchantName = normalizeSingleParam(resolvedParams.merchantName);
    const dateFrom = normalizeSingleParam(resolvedParams.dateFrom);
    const dateTo = normalizeSingleParam(resolvedParams.dateTo);

    const rows = await getWebTransactions(activeBrandId, {
      sourceSystem,
      status: status ?? undefined,
      canonicalType: canonicalType ?? undefined,
      merchantName: merchantName ?? undefined,
      dateFrom: dateFrom ?? undefined,
      dateTo: dateTo ?? undefined
    });
    const metrics = buildWebTransactionMetrics(rows);
    const successRate = metrics.total_count > 0 ? (metrics.successful_count / metrics.total_count) * 100 : 0;

    const statusOptions = Array.from(new Set(rows.map((item) => item.canonical_status))).sort((a, b) =>
      a.localeCompare(b)
    );
    const typeOptions = Array.from(new Set(rows.map((item) => item.canonical_type))).sort((a, b) =>
      a.localeCompare(b)
    );
    const merchantOptions = Array.from(new Set(rows.map((item) => item.merchant_name).filter(Boolean))).sort((a, b) =>
      (a ?? "").localeCompare(b ?? "")
    );

    const hasFinanceAccess = role === "finance" || role === "admin";

    const sourceLabel = sourceSystem === "backoffice" ? "Backoffice" : "Payment Gateway";

    return (
      <div className="space-y-6">
        <PageHeader title="Web Transactions" description="Import and review web transaction activity." />

        <WebTransactionImport canImport={hasFinanceAccess} sourceSystem={sourceSystem} sourceLabel={sourceLabel} />

        <StatTileGrid
          className={
            sourceSystem === "backoffice"
              ? "lg:grid-cols-2 2xl:grid-cols-7"
              : sourceSystem === "payment_gateway"
                ? "lg:grid-cols-2 2xl:grid-cols-6"
                : "lg:grid-cols-2 2xl:grid-cols-5"
          }
        >
          <StatTile label="Total Transactions" value={metrics.total_count.toLocaleString("id-ID")} />
          <StatTile label="Successful" value={metrics.successful_count.toLocaleString("id-ID")} />
          <StatTile label="Success Rate" value={`${successRate.toFixed(2)}%`} />
          <StatTile
            label="Gross Amount"
            value={
              <span className={getAmountColorClass(metrics.gross_amount)}>
                Rp {formatAmount(metrics.gross_amount, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </span>
            }
          />
          <StatTile
            label="Net (Amount - Fee)"
            value={
              <span className={getAmountColorClass(metrics.net_amount)}>
                Rp {formatAmount(metrics.net_amount, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </span>
            }
          />
          {sourceSystem === "payment_gateway" ? (
            <StatTile
              label="Fee Amount (Abs)"
              value={`Rp ${formatAmount(Math.abs(metrics.fee_amount), {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3
              })}`}
            />
          ) : null}
          {sourceSystem === "backoffice" ? (
            <>
              <StatTile
                label="Payin Count / Amount"
                value={metrics.payin_count.toLocaleString("id-ID")}
                sublabel={
                  <p className={`text-sm ${getAmountColorClass(metrics.payin_amount)}`}>
                    Rp {formatAmount(metrics.payin_amount, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  </p>
                }
              />
              <StatTile
                label="Payout Count / Amount"
                value={metrics.payout_count.toLocaleString("id-ID")}
                sublabel={
                  <p className={`text-sm ${getAmountColorClass(metrics.payout_amount)}`}>
                    Rp {formatAmount(metrics.payout_amount, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  </p>
                }
              />
            </>
          ) : null}
        </StatTileGrid>

        <WebTransactionsFilters
          sourceSystem={sourceSystem}
          statusOptions={statusOptions}
          typeOptions={typeOptions}
          merchantOptions={merchantOptions.filter((option): option is string => Boolean(option))}
          selectedStatus={status}
          selectedCanonicalType={canonicalType}
          selectedMerchantName={merchantName}
          selectedDateFrom={dateFrom}
          selectedDateTo={dateTo}
        />

        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">Web Transaction Records ({sourceLabel})</h2>
          <WebTransactionsTable rows={rows} sourceSystem={sourceSystem} canManage={hasFinanceAccess} />
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
      <SetupRequiredCard
        title="Web Transactions setup required"
        message="The app cannot read web transactions yet. Apply SQL migrations and check your Supabase env keys."
        error={errorText}
      />
    );
  }
}
