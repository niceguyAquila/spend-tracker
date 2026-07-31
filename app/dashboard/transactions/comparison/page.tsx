import { getWebTransactionComparison } from "@/lib/db/queries";
import { requireAllowedUser } from "@/lib/auth";
import type { WebTransactionComparisonOutcome } from "@/lib/types";
import { WebTransactionsComparisonFilters } from "@/components/web-transactions-comparison-filters";
import { WebTransactionComparisonTable } from "@/components/web-transaction-comparison-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import { formatAmount, getAmountColorClass } from "@/lib/display-format";

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
      <PageHeader
        title="Backoffice vs Payment Gateway Comparison"
        description="Reconciliation key: Transaction No + Type. Amount comparison uses exact value equality."
      />

      <WebTransactionsComparisonFilters
        outcomeOptions={OUTCOME_OPTIONS}
        selectedStatus={status}
        selectedCanonicalType={canonicalType}
        selectedTransactionNo={transactionNo}
        selectedDateFrom={dateFrom}
        selectedDateTo={dateTo}
        selectedOutcome={outcome}
      />

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <StatTile
          label="Backoffice Total Transactions / Amount"
          value={comparison.metrics.backoffice.total_count.toLocaleString("id-ID")}
          sublabel={
            <>
              <p className={`text-sm ${getAmountColorClass(comparison.metrics.backoffice.total_amount)}`}>
                Rp{" "}
                {formatAmount(comparison.metrics.backoffice.total_amount, {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: 3
                })}
              </p>
              <p className="mt-3">
                Payin: {comparison.metrics.backoffice.payin_count.toLocaleString("id-ID")} / Rp{" "}
                {formatAmount(comparison.metrics.backoffice.payin_amount, {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: 3
                })}
              </p>
              <p>
                Payout: {comparison.metrics.backoffice.payout_count.toLocaleString("id-ID")} / Rp{" "}
                {formatAmount(comparison.metrics.backoffice.payout_amount, {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: 3
                })}
              </p>
            </>
          }
        />

        <StatTile
          label="Payment Gateway Total Transactions / Amount"
          value={comparison.metrics.payment_gateway.total_count.toLocaleString("id-ID")}
          sublabel={
            <>
              <p className={`text-sm ${getAmountColorClass(comparison.metrics.payment_gateway.total_amount)}`}>
                Rp{" "}
                {formatAmount(comparison.metrics.payment_gateway.total_amount, {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: 3
                })}
              </p>
              <p className="mt-3">
                Payin: {comparison.metrics.payment_gateway.payin_count.toLocaleString("id-ID")} / Rp{" "}
                {formatAmount(comparison.metrics.payment_gateway.payin_amount, {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: 3
                })}
              </p>
              <p>
                Payout: {comparison.metrics.payment_gateway.payout_count.toLocaleString("id-ID")} / Rp{" "}
                {formatAmount(comparison.metrics.payment_gateway.payout_amount, {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: 3
                })}
              </p>
            </>
          }
        />
      </section>

      <StatTileGrid>
        <StatTile label="Matched" value={comparison.metrics.matched_count.toLocaleString("id-ID")} />
        <StatTile label="Mismatched" value={comparison.metrics.mismatched_count.toLocaleString("id-ID")} />
        <StatTile
          label="Missing in Backoffice"
          value={comparison.metrics.missing_in_backoffice_count.toLocaleString("id-ID")}
        />
        <StatTile
          label="Missing in Payment Gateway"
          value={comparison.metrics.missing_in_gateway_count.toLocaleString("id-ID")}
        />
      </StatTileGrid>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Reconciliation Rows ({comparison.rows.length.toLocaleString("id-ID")})</h2>
        <WebTransactionComparisonTable rows={comparison.rows} />
      </section>
    </div>
  );
}
