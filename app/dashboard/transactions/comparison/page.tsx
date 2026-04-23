import { getWebTransactionComparison } from "@/lib/db/queries";
import { requireAllowedUser } from "@/lib/auth";
import type { WebTransactionComparisonOutcome } from "@/lib/types";

type SearchParamValue = string | string[] | undefined;

type ComparisonPageProps = {
  searchParams?: Promise<Record<string, SearchParamValue>>;
};

const OUTCOME_OPTIONS: Array<{ value: WebTransactionComparisonOutcome; label: string }> = [
  { value: "matched", label: "Matched" },
  { value: "mismatched", label: "Mismatch" },
  { value: "missing_in_backoffice", label: "Missing Backoffice" },
  { value: "missing_in_gateway", label: "Missing Payment Gateway" }
];

function normalizeSingleParam(param: SearchParamValue): string | null {
  if (!param) return null;
  if (Array.isArray(param)) return param[0]?.trim() || null;
  const normalized = param.trim();
  return normalized.length ? normalized : null;
}

function formatCurrency3(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });
}

function getComparisonOutcomeLabel(outcome: WebTransactionComparisonOutcome) {
  if (outcome === "matched") return "Matched";
  if (outcome === "mismatched") return "Mismatch";
  if (outcome === "missing_in_backoffice") return "Missing Backoffice";
  return "Missing Payment Gateway";
}

function getComparisonOutcomeClassName(outcome: WebTransactionComparisonOutcome) {
  if (outcome === "matched") return "bg-emerald-100 text-emerald-800";
  if (outcome === "mismatched") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

export default async function TransactionsComparisonPage({ searchParams }: ComparisonPageProps) {
  const { activeBrandId } = await requireAllowedUser();
  const resolvedParams = (await searchParams) ?? {};
  const status = normalizeSingleParam(resolvedParams.status);
  const canonicalType = normalizeSingleParam(resolvedParams.canonicalType);
  const transactionNo = normalizeSingleParam(resolvedParams.transactionNo);
  const dateFrom = normalizeSingleParam(resolvedParams.dateFrom);
  const dateTo = normalizeSingleParam(resolvedParams.dateTo);
  const outcome = normalizeSingleParam(resolvedParams.outcome) as WebTransactionComparisonOutcome | null;

  const comparison = await getWebTransactionComparison(activeBrandId, {
    status: status ?? undefined,
    canonicalType: canonicalType ?? undefined,
    transactionNo: transactionNo ?? undefined,
    outcome: outcome ?? undefined,
    dateFrom: dateFrom ?? undefined,
    dateTo: dateTo ?? undefined
  });

  return (
    <div className="space-y-6">
      <section className="card space-y-2">
        <h2 className="text-lg font-semibold">Backoffice vs Payment Gateway Comparison</h2>
        <p className="text-sm text-slate-600">
          Reconciliation key: Transaction No + Type. Amount comparison uses exact value equality.
        </p>
      </section>

      <form className="card grid grid-cols-1 gap-3 xl:grid-cols-6">
        <label className="text-sm text-slate-700">
          <span className="mb-1 block">Transaction No</span>
          <input name="transactionNo" type="text" defaultValue={transactionNo ?? ""} className="field" placeholder="Contains..." />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block">Status</span>
          <input name="status" type="text" defaultValue={status ?? ""} className="field" placeholder="Successful / Pending..." />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block">Type</span>
          <select name="canonicalType" defaultValue={canonicalType ?? ""} className="field">
            <option value="">All types</option>
            <option value="Payin">Payin</option>
            <option value="Payout">Payout</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block">Result</span>
          <select name="outcome" defaultValue={outcome ?? ""} className="field">
            <option value="">All results</option>
            {OUTCOME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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
        <div className="flex gap-2 xl:col-span-6">
          <button className="btn" type="submit">
            Apply Filters
          </button>
          <a className="btn-secondary" href="/dashboard/transactions/comparison">
            Clear
          </a>
        </div>
      </form>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="card">
          <p className="text-xs uppercase text-slate-500">Backoffice Total Transactions / Amount</p>
          <p className="mt-1 text-2xl font-semibold">{comparison.metrics.backoffice.total_count.toLocaleString("id-ID")}</p>
          <p className="mt-1 text-sm text-slate-600">Rp {formatCurrency3(comparison.metrics.backoffice.total_amount)}</p>
          <p className="mt-3 text-xs text-slate-500">
            Payin: {comparison.metrics.backoffice.payin_count.toLocaleString("id-ID")} / Rp{" "}
            {formatCurrency3(comparison.metrics.backoffice.payin_amount)}
          </p>
          <p className="text-xs text-slate-500">
            Payout: {comparison.metrics.backoffice.payout_count.toLocaleString("id-ID")} / Rp{" "}
            {formatCurrency3(comparison.metrics.backoffice.payout_amount)}
          </p>
        </article>

        <article className="card">
          <p className="text-xs uppercase text-slate-500">Payment Gateway Total Transactions / Amount</p>
          <p className="mt-1 text-2xl font-semibold">
            {comparison.metrics.payment_gateway.total_count.toLocaleString("id-ID")}
          </p>
          <p className="mt-1 text-sm text-slate-600">Rp {formatCurrency3(comparison.metrics.payment_gateway.total_amount)}</p>
          <p className="mt-3 text-xs text-slate-500">
            Payin: {comparison.metrics.payment_gateway.payin_count.toLocaleString("id-ID")} / Rp{" "}
            {formatCurrency3(comparison.metrics.payment_gateway.payin_amount)}
          </p>
          <p className="text-xs text-slate-500">
            Payout: {comparison.metrics.payment_gateway.payout_count.toLocaleString("id-ID")} / Rp{" "}
            {formatCurrency3(comparison.metrics.payment_gateway.payout_amount)}
          </p>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <article className="card">
          <p className="text-xs uppercase text-slate-500">Matched</p>
          <p className="mt-1 text-2xl font-semibold">{comparison.metrics.matched_count.toLocaleString("id-ID")}</p>
        </article>
        <article className="card">
          <p className="text-xs uppercase text-slate-500">Mismatched</p>
          <p className="mt-1 text-2xl font-semibold">{comparison.metrics.mismatched_count.toLocaleString("id-ID")}</p>
        </article>
        <article className="card">
          <p className="text-xs uppercase text-slate-500">Missing in Backoffice</p>
          <p className="mt-1 text-2xl font-semibold">{comparison.metrics.missing_in_backoffice_count.toLocaleString("id-ID")}</p>
        </article>
        <article className="card">
          <p className="text-xs uppercase text-slate-500">Missing in Payment Gateway</p>
          <p className="mt-1 text-2xl font-semibold">{comparison.metrics.missing_in_gateway_count.toLocaleString("id-ID")}</p>
        </article>
      </section>

      <section className="card overflow-x-auto">
        <h3 className="mb-3 text-lg font-semibold">Reconciliation Rows ({comparison.rows.length.toLocaleString("id-ID")})</h3>
        <table className="min-w-[1100px] text-sm">
          <thead className="border-b bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Transaction No</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Backoffice Status</th>
              <th className="px-3 py-2">Gateway Status</th>
              <th className="px-3 py-2">Backoffice Amount</th>
              <th className="px-3 py-2">Gateway Amount</th>
              <th className="px-3 py-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.comparison_key} className="border-b">
                <td className="px-3 py-2 font-mono text-xs">{row.transaction_no}</td>
                <td className="px-3 py-2">{row.canonical_type}</td>
                <td className="px-3 py-2">{row.backoffice?.canonical_status ?? "-"}</td>
                <td className="px-3 py-2">{row.payment_gateway?.canonical_status ?? "-"}</td>
                <td className="px-3 py-2">{row.backoffice ? formatCurrency3(row.backoffice.amount) : "-"}</td>
                <td className="px-3 py-2">{row.payment_gateway ? formatCurrency3(row.payment_gateway.amount) : "-"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getComparisonOutcomeClassName(
                      row.outcome
                    )}`}
                  >
                    {getComparisonOutcomeLabel(row.outcome)}
                  </span>
                </td>
              </tr>
            ))}
            {!comparison.rows.length ? (
              <tr>
                <td className="px-3 py-4 text-center text-slate-600" colSpan={7}>
                  No comparison rows for the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
