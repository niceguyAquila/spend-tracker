"use client";

import { useMemo } from "react";
import type { WebTransactionComparisonOutcome, WebTransactionComparisonRow } from "@/lib/types";
import { formatAmount, getAmountColorClass } from "@/lib/display-format";
import { sliceForPage, useTablePagination } from "@/lib/table-pagination";
import { TablePaginationBar } from "@/components/ui/table-pagination-bar";
import { TableEmptyState } from "@/components/ui/table-empty-state";

type Props = {
  rows: WebTransactionComparisonRow[];
};

function getComparisonOutcomeLabel(outcome: WebTransactionComparisonOutcome) {
  if (outcome === "matched") return "Matched";
  if (outcome === "mismatched") return "Mismatch";
  if (outcome === "missing_in_backoffice") return "Missing Backoffice";
  return "Missing Payment Gateway";
}

function getComparisonOutcomeClassName(outcome: WebTransactionComparisonOutcome) {
  if (outcome === "matched") return "bg-[rgb(var(--success)/0.15)] text-[rgb(var(--success))]";
  if (outcome === "mismatched") return "bg-[rgb(var(--warning)/0.15)] text-[rgb(var(--warning))]";
  return "bg-[rgb(var(--surface-muted))] text-[rgb(var(--text-muted))]";
}

export function WebTransactionComparisonTable({ rows }: Props) {
  const pagination = useTablePagination(rows.length);
  const pagedRows = useMemo(
    () => sliceForPage(rows, pagination.page, pagination.pageSize),
    [rows, pagination.page, pagination.pageSize]
  );

  return (
    <>
      <div className="overflow-x-auto">
        <table className="data-table data-table-zebra min-w-[1100px]">
          <thead>
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
            {pagedRows.map((row) => (
              <tr key={row.comparison_key}>
                <td className="px-3 py-2 font-mono text-xs">{row.transaction_no}</td>
                <td className="px-3 py-2">{row.canonical_type}</td>
                <td className="px-3 py-2">{row.backoffice?.canonical_status ?? "-"}</td>
                <td className="px-3 py-2">{row.payment_gateway?.canonical_status ?? "-"}</td>
                <td className={`px-3 py-2 ${row.backoffice ? getAmountColorClass(row.backoffice.amount) : ""}`}>
                  {row.backoffice ? formatAmount(row.backoffice.amount, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : "-"}
                </td>
                <td className={`px-3 py-2 ${row.payment_gateway ? getAmountColorClass(row.payment_gateway.amount) : ""}`}>
                  {row.payment_gateway
                    ? formatAmount(row.payment_gateway.amount, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
                    : "-"}
                </td>
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
            {!rows.length ? (
              <TableEmptyState colSpan={7} message="No comparison rows for the selected filters." />
            ) : null}
          </tbody>
        </table>
      </div>
      <TablePaginationBar
        totalCount={rows.length}
        page={pagination.page}
        setPage={pagination.setPage}
        pageSize={pagination.pageSize}
        setPageSize={pagination.setPageSize}
        pageCount={pagination.pageCount}
        rangeLabel={pagination.rangeLabel}
      />
    </>
  );
}
