import { WebTransactionImport } from "@/components/web-transaction-import";
import { buildWebTransactionMetrics, getWebTransactions } from "@/lib/db/queries";
import { requireAllowedUser } from "@/lib/auth";

type SearchParamValue = string | string[] | undefined;

type TransactionsPageProps = {
  searchParams?: Promise<Record<string, SearchParamValue>>;
};
type SourceSystem = "backoffice" | "payment_gateway";

function formatDecimalWithDot(value: number) {
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });
  return formatted.replace(/,/g, "");
}

function formatCurrency3(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });
}

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
      <div className="space-y-4">
        <section className="card">
          <h2 className="text-lg font-semibold">Web Transaction Source</h2>
          <div className="mt-2 flex gap-2">
            <a
              href="/dashboard/transactions?source=backoffice"
              className={`btn-secondary ${
                sourceSystem === "backoffice"
                  ? "!border-blue-600 !bg-blue-600 !text-white hover:!bg-blue-600"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Backoffice
            </a>
            <a
              href="/dashboard/transactions?source=payment_gateway"
              className={`btn-secondary ${
                sourceSystem === "payment_gateway"
                  ? "!border-blue-600 !bg-blue-600 !text-white hover:!bg-blue-600"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Payment Gateway
            </a>
          </div>
        </section>

        <WebTransactionImport canImport={hasFinanceAccess} sourceSystem={sourceSystem} sourceLabel={sourceLabel} />

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
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
            <p className="mt-1 text-2xl font-semibold">Rp {formatCurrency3(metrics.gross_amount)}</p>
          </article>
          <article className="card">
            <p className="text-xs uppercase text-slate-500">Net (Amount - Fee)</p>
            <p className="mt-1 text-2xl font-semibold">Rp {formatCurrency3(metrics.net_amount)}</p>
          </article>
        </section>

        <form className="card grid grid-cols-1 gap-3 md:grid-cols-5">
          <input type="hidden" name="source" value={sourceSystem} />
          <label className="text-sm text-slate-700">
            <span className="mb-1 block">Status</span>
            <select name="status" defaultValue={status ?? ""} className="field">
              <option value="">All status</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block">Type</span>
            <select name="canonicalType" defaultValue={canonicalType ?? ""} className="field">
              <option value="">All types</option>
              {typeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block">Merchant</span>
            <select name="merchantName" defaultValue={merchantName ?? ""} className="field">
              <option value="">All merchants</option>
              {merchantOptions.map((option) => (
                <option key={option} value={option ?? ""}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block">Date From</span>
            <input name="dateFrom" type="date" defaultValue={dateFrom ?? ""} className="field" />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block">Date To</span>
            <input name="dateTo" type="date" defaultValue={dateTo ?? ""} className="field" />
          </label>
          <div className="md:col-span-5 flex gap-2">
            <button className="btn" type="submit">
              Apply Filters
            </button>
            <a className="btn-secondary" href={`/dashboard/transactions?source=${sourceSystem}`}>
              Clear
            </a>
          </div>
        </form>

        <section className="card overflow-x-auto">
          <h2 className="mb-3 text-lg font-semibold">Web Transaction Records ({sourceLabel})</h2>
          <table className="min-w-full text-sm">
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
                  <td className="px-3 py-2">{new Date(row.create_time).toLocaleString("id-ID")}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.external_txn_no}</td>
                  <td className="px-3 py-2">{row.canonical_status}</td>
                  <td className="px-3 py-2">{row.canonical_type}</td>
                  <td className="px-3 py-2">{row.currency_code} {formatCurrency3(row.amount)}</td>
                  <td className="px-3 py-2">
                    {row.merchant_fee === null ? "-" : formatDecimalWithDot(row.merchant_fee)}
                  </td>
                  <td className="px-3 py-2">
                    {row.currency_code} {formatCurrency3(row.amount - Math.abs(row.merchant_fee ?? 0))}
                  </td>
                  <td className="px-3 py-2">{row.merchant_name ?? "-"}</td>
                  <td className="px-3 py-2">{new Date(row.last_update_time).toLocaleString("id-ID")}</td>
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
