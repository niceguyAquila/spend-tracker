"use client";

import { useMemo } from "react";
import type { WebTransaction } from "@/lib/types";
import { formatAmount, formatDateTimeDisplay, getAmountColorClass } from "@/lib/display-format";
import { sliceForPage, useTablePagination } from "@/lib/table-pagination";
import { TablePaginationBar } from "@/components/ui/table-pagination-bar";

type Props = {
  rows: WebTransaction[];
};

export function WebTransactionsTable({ rows }: Props) {
  const pagination = useTablePagination(rows.length);
  const pagedRows = useMemo(
    () => sliceForPage(rows, pagination.page, pagination.pageSize),
    [rows, pagination.page, pagination.pageSize]
  );

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-[960px] text-sm">
          <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
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
            {pagedRows.map((row) => (
              <tr key={row.id} className="border-b border-[rgb(var(--border))]">
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
                <td className="px-3 py-4 text-center text-muted" colSpan={9}>
                  No web transactions match current filters.
                </td>
              </tr>
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
