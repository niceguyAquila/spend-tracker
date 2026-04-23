import { WebTransactionImport } from "@/components/web-transaction-import";
import { WebTransactionsFilters } from "@/components/web-transactions-filters";
import { buildWebTransactionMetrics, getWebTransactions } from "@/lib/db/queries";
import { requireAllowedUser } from "@/lib/auth";
import { formatAmount, formatDateTimeDisplay, getAmountColorClass } from "@/lib/display-format";

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
        <WebTransactionImport canImport={hasFinanceAccess} sourceSystem={sourceSystem} sourceLabel={sourceLabel} />

        <section
          className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${
            sourceSystem === "backoffice"
              ? "2xl:grid-cols-7"
              : sourceSystem === "payment_gateway"
                ? "2xl:grid-cols-6"
                : "2xl:grid-cols-5"
          }`}
        >
          <article className="card">
            <p className="text-xs uppercase text-slate-500">Total Transactions</p>
            <p className="mt-1 text-2xl font-semibold">{metrics.total_count.toLocaleString("id-ID")}</p>
          </article>
          <article className="card">
            <p className="text-xs uppercase text-slate-500">Successful</p>
            <p className="mt-1 text-2xl font-semibold">{metrics.successful_count.toLocaleString("id-ID")}</p>
          </article>
          <article className="card">
            <p className="text-xs uppercase text-slate-500">Success Rate</p>
            <p className="mt-1 text-2xl font-semibold">{successRate.toFixed(2)}%</p>
          </article>
          <article className="card">
            <p className="text-xs uppercase text-slate-500">Gross Amount</p>
            <p className={`mt-1 text-2xl font-semibold ${getAmountColorClass(metrics.gross_amount)}`}>
              Rp {formatAmount(metrics.gross_amount, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
            </p>
          </article>
          <article className="card">
            <p className="text-xs uppercase text-slate-500">Net (Amount - Fee)</p>
            <p className={`mt-1 text-2xl font-semibold ${getAmountColorClass(metrics.net_amount)}`}>
              Rp {formatAmount(metrics.net_amount, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
            </p>
          </article>
          {sourceSystem === "payment_gateway" ? (
            <article className="card">
              <p className="text-xs uppercase text-slate-500">Fee Amount (Abs)</p>
              <p className="mt-1 text-2xl font-semibold">
                Rp {formatAmount(Math.abs(metrics.fee_amount), { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </p>
            </article>
          ) : null}
          {sourceSystem === "backoffice" ? (
            <>
              <article className="card">
                <p className="text-xs uppercase text-slate-500">Payin Count / Amount</p>
                <p className="mt-1 text-2xl font-semibold">{metrics.payin_count.toLocaleString("id-ID")}</p>
                <p className={`mt-1 text-sm ${getAmountColorClass(metrics.payin_amount)}`}>
                  Rp {formatAmount(metrics.payin_amount, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                </p>
              </article>
              <article className="card">
                <p className="text-xs uppercase text-slate-500">Payout Count / Amount</p>
                <p className="mt-1 text-2xl font-semibold">{metrics.payout_count.toLocaleString("id-ID")}</p>
                <p className={`mt-1 text-sm ${getAmountColorClass(metrics.payout_amount)}`}>
                  Rp {formatAmount(metrics.payout_amount, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                </p>
              </article>
            </>
          ) : null}
        </section>

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

        <section className="card overflow-x-auto">
          <h2 className="mb-3 text-lg font-semibold">Web Transaction Records ({sourceLabel})</h2>
          <table className="min-w-[960px] text-sm">
            <thead className="border-b bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Create Time</th>
                <th className="px-3 py-2">Transaction No</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Fee</th>
                <th className="px-3 py-2">Net Amount</th>
                <th className="px-3 py-2">Merchant</th>
                <th className="px-3 py-2">Last Update</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="px-3 py-2">{formatDateTimeDisplay(row.create_time)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.external_txn_no}</td>
                  <td className="px-3 py-2">{row.canonical_status}</td>
                  <td className="px-3 py-2">{row.canonical_type}</td>
                  <td className={`px-3 py-2 ${getAmountColorClass(row.amount)}`}>
                    {row.currency_code} {formatAmount(row.amount, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  </td>
                  <td className={`px-3 py-2 ${row.merchant_fee === null ? "" : getAmountColorClass(row.merchant_fee)}`}>
                    {row.merchant_fee === null ? "-" : formatAmount(row.merchant_fee, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  </td>
                  <td className={`px-3 py-2 ${getAmountColorClass(row.amount - Math.abs(row.merchant_fee ?? 0))}`}>
                    {row.currency_code}{" "}
                    {formatAmount(row.amount - Math.abs(row.merchant_fee ?? 0), { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  </td>
                  <td className="px-3 py-2">{row.merchant_name ?? "-"}</td>
                  <td className="px-3 py-2">{formatDateTimeDisplay(row.last_update_time)}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-600" colSpan={9}>
                    No web transactions match current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
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
        <h2 className="mb-2 text-lg font-semibold">Web Transactions setup required</h2>
        <p className="text-sm text-slate-700">
          The app cannot read web transactions yet. Apply SQL migrations and check your Supabase env keys.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Error: {errorText}
        </p>
      </section>
    );
  }
}
