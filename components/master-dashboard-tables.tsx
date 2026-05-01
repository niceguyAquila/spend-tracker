"use client";

import { Fragment, useMemo } from "react";
import type { BigBookEntry, BigBookTypeCashflowByCurrency, CreditBookTypeCashflowByCurrency } from "@/lib/types";
import { formatAmount, formatDateDisplay, getAmountColorClass } from "@/lib/display-format";
import { sliceForPage, useTablePagination } from "@/lib/table-pagination";
import { TablePaginationBar } from "@/components/ui/table-pagination-bar";

type CashflowSummary = {
  inflow: number;
  outflow: number;
  net: number;
};

type SourceRowByCurrency = {
  currency: string;
  webSpending: CashflowSummary;
  bigBook: CashflowSummary;
  combined: CashflowSummary;
};

type MasterDashboardCashflowTableProps = {
  sourceRowsByCurrency: SourceRowByCurrency[];
};

export function MasterDashboardCashflowTable({ sourceRowsByCurrency }: MasterDashboardCashflowTableProps) {
  const pagination = useTablePagination(sourceRowsByCurrency.length);
  const paged = useMemo(
    () => sliceForPage(sourceRowsByCurrency, pagination.page, pagination.pageSize),
    [sourceRowsByCurrency, pagination.page, pagination.pageSize]
  );

  return (
    <>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
            <tr>
              <th className="px-3 py-2">Currency</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Inflow</th>
              <th className="px-3 py-2">Outflow</th>
              <th className="px-3 py-2">Net</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((row, index) => (
              <Fragment key={row.currency}>
                <tr className="border-b border-[rgb(var(--border))]">
                  <td className="px-3 py-2">{row.currency}</td>
                  <td className="px-3 py-2">Web Spending</td>
                  <td className={`px-3 py-2 ${getAmountColorClass(row.webSpending.inflow)}`}>
                    {row.currency} {formatAmount(row.webSpending.inflow)}
                  </td>
                  <td className={`px-3 py-2 ${getAmountColorClass(-row.webSpending.outflow)}`}>
                    {row.currency} {formatAmount(row.webSpending.outflow)}
                  </td>
                  <td className={`px-3 py-2 ${getAmountColorClass(row.webSpending.net)}`}>
                    {row.currency} {formatAmount(row.webSpending.net)}
                  </td>
                </tr>
                <tr className="border-b border-[rgb(var(--border))]">
                  <td className="px-3 py-2">{row.currency}</td>
                  <td className="px-3 py-2">Big Book</td>
                  <td className={`px-3 py-2 ${getAmountColorClass(row.bigBook.inflow)}`}>
                    {row.currency} {formatAmount(row.bigBook.inflow)}
                  </td>
                  <td className={`px-3 py-2 ${getAmountColorClass(-row.bigBook.outflow)}`}>
                    {row.currency} {formatAmount(row.bigBook.outflow)}
                  </td>
                  <td className={`px-3 py-2 ${getAmountColorClass(row.bigBook.net)}`}>
                    {row.currency} {formatAmount(row.bigBook.net)}
                  </td>
                </tr>
                <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-[rgb(var(--text))]">
                  <td className="px-3 py-2">{row.currency}</td>
                  <td className="px-3 py-2 font-semibold">Combined</td>
                  <td className={`px-3 py-2 font-semibold ${getAmountColorClass(row.combined.inflow)}`}>
                    {row.currency} {formatAmount(row.combined.inflow)}
                  </td>
                  <td className={`px-3 py-2 font-semibold ${getAmountColorClass(-row.combined.outflow)}`}>
                    {row.currency} {formatAmount(row.combined.outflow)}
                  </td>
                  <td className={`px-3 py-2 font-semibold ${getAmountColorClass(row.combined.net)}`}>
                    {row.currency} {formatAmount(row.combined.net)}
                  </td>
                </tr>
                {index < paged.length - 1 ? (
                  <tr aria-hidden="true">
                    <td className="p-0" colSpan={5}>
                      <div className="h-4" />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <TablePaginationBar
        totalCount={sourceRowsByCurrency.length}
        show={sourceRowsByCurrency.length > 0}
        hideRangeLabel
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

type MasterDashboardBigBookEntriesTableProps = {
  entries: BigBookEntry[];
};

export function MasterDashboardBigBookEntriesTable({ entries }: MasterDashboardBigBookEntriesTableProps) {
  const pagination = useTablePagination(entries.length);
  const pagedEntries = useMemo(
    () => sliceForPage(entries, pagination.page, pagination.pageSize),
    [entries, pagination.page, pagination.pageSize]
  );

  return (
    <>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
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
            {pagedEntries.map((entry) => (
              <tr key={entry.id} className="border-b border-[rgb(var(--border))]">
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
            {!entries.length ? (
              <tr>
                <td className="px-3 py-4 text-center text-muted" colSpan={6}>
                  No Big Book entries found for this brand type mapping.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <TablePaginationBar
        totalCount={entries.length}
        show={entries.length > 0}
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

type MasterDashboardBigBookTypeCashflowTableProps = {
  sourceRowsByCurrency: BigBookTypeCashflowByCurrency[];
};

function getBlueOrNeutralClass(value: number) {
  return value > 0 ? "text-blue-600" : "text-[rgb(var(--text-muted))]";
}

function getRedOrNeutralClass(value: number) {
  return value > 0 ? "text-rose-600" : "text-[rgb(var(--text-muted))]";
}

function getNetBlueRedNeutralClass(value: number) {
  if (value > 0) return "text-blue-600";
  if (value < 0) return "text-rose-600";
  return "text-[rgb(var(--text-muted))]";
}

export function MasterDashboardBigBookTypeCashflowTable({
  sourceRowsByCurrency
}: MasterDashboardBigBookTypeCashflowTableProps) {
  const visibleRowsByCurrency = useMemo(
    () => sourceRowsByCurrency.filter((currencyRow) => currencyRow.rows.length > 0),
    [sourceRowsByCurrency]
  );

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
          <tr>
            <th className="px-3 py-2">Currency</th>
            <th className="px-3 py-2">Actor</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Inflow</th>
            <th className="px-3 py-2">Outflow</th>
            <th className="px-3 py-2">Net</th>
          </tr>
        </thead>
        <tbody>
          {visibleRowsByCurrency.map((currencyRow, index) => (
            <Fragment key={currencyRow.currency}>
              {currencyRow.rows.map((row) => (
                <tr key={`${currencyRow.currency}:${row.row_key}`} className="border-b border-[rgb(var(--border))]">
                  <td className="px-3 py-2">{currencyRow.currency}</td>
                  <td className="px-3 py-2">{row.actor_display_name}</td>
                  <td className="px-3 py-2">{row.type_name}</td>
                  <td className={`px-3 py-2 ${getBlueOrNeutralClass(row.inflow)}`}>
                    {currencyRow.currency} {formatAmount(row.inflow)}
                  </td>
                  <td className={`px-3 py-2 ${getRedOrNeutralClass(row.outflow)}`}>
                    {currencyRow.currency} {formatAmount(row.outflow)}
                  </td>
                  <td className={`px-3 py-2 ${getNetBlueRedNeutralClass(row.net)}`}>
                    {currencyRow.currency} {formatAmount(row.net)}
                  </td>
                </tr>
              ))}
              <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-[rgb(var(--text))]">
                <td className="px-3 py-2">{currencyRow.currency}</td>
                <td className="px-3 py-2 font-semibold" colSpan={2}>Combined</td>
                <td className={`px-3 py-2 font-semibold ${getBlueOrNeutralClass(currencyRow.combined.inflow)}`}>
                  {currencyRow.currency} {formatAmount(currencyRow.combined.inflow)}
                </td>
                <td className={`px-3 py-2 font-semibold ${getRedOrNeutralClass(currencyRow.combined.outflow)}`}>
                  {currencyRow.currency} {formatAmount(currencyRow.combined.outflow)}
                </td>
                <td className={`px-3 py-2 font-semibold ${getNetBlueRedNeutralClass(currencyRow.combined.net)}`}>
                  {currencyRow.currency} {formatAmount(currencyRow.combined.net)}
                </td>
              </tr>
              {index < visibleRowsByCurrency.length - 1 ? (
                <tr aria-hidden="true">
                  <td className="p-0" colSpan={6}>
                    <div className="h-4" />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
          {!visibleRowsByCurrency.length ? (
            <tr>
              <td className="px-3 py-4 text-center text-muted" colSpan={6}>
                No Big Book cashflow data matches the selected filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

type MasterDashboardCreditBookTypeCashflowTableProps = {
  sourceRowsByCurrency: CreditBookTypeCashflowByCurrency[];
};

export function MasterDashboardCreditBookTypeCashflowTable({
  sourceRowsByCurrency
}: MasterDashboardCreditBookTypeCashflowTableProps) {
  const visibleRowsByCurrency = useMemo(
    () => sourceRowsByCurrency.filter((currencyRow) => currencyRow.rows.length > 0),
    [sourceRowsByCurrency]
  );

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
          <tr>
            <th className="px-3 py-2">Currency</th>
            <th className="px-3 py-2">Actor</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Inflow</th>
            <th className="px-3 py-2">Outflow</th>
            <th className="px-3 py-2">Net</th>
          </tr>
        </thead>
        <tbody>
          {visibleRowsByCurrency.map((currencyRow, index) => (
            <Fragment key={currencyRow.currency}>
              {currencyRow.rows.map((row) => (
                <tr key={`${currencyRow.currency}:${row.row_key}`} className="border-b border-[rgb(var(--border))]">
                  <td className="px-3 py-2">{currencyRow.currency}</td>
                  <td className="px-3 py-2">{row.actor_display_name}</td>
                  <td className="px-3 py-2">{row.type_name}</td>
                  <td className={`px-3 py-2 ${getBlueOrNeutralClass(row.inflow)}`}>
                    {currencyRow.currency} {formatAmount(row.inflow)}
                  </td>
                  <td className={`px-3 py-2 ${getRedOrNeutralClass(row.outflow)}`}>
                    {currencyRow.currency} {formatAmount(row.outflow)}
                  </td>
                  <td className={`px-3 py-2 ${getNetBlueRedNeutralClass(row.net)}`}>
                    {currencyRow.currency} {formatAmount(row.net)}
                  </td>
                </tr>
              ))}
              <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-[rgb(var(--text))]">
                <td className="px-3 py-2">{currencyRow.currency}</td>
                <td className="px-3 py-2 font-semibold" colSpan={2}>Combined</td>
                <td className={`px-3 py-2 font-semibold ${getBlueOrNeutralClass(currencyRow.combined.inflow)}`}>
                  {currencyRow.currency} {formatAmount(currencyRow.combined.inflow)}
                </td>
                <td className={`px-3 py-2 font-semibold ${getRedOrNeutralClass(currencyRow.combined.outflow)}`}>
                  {currencyRow.currency} {formatAmount(currencyRow.combined.outflow)}
                </td>
                <td className={`px-3 py-2 font-semibold ${getNetBlueRedNeutralClass(currencyRow.combined.net)}`}>
                  {currencyRow.currency} {formatAmount(currencyRow.combined.net)}
                </td>
              </tr>
              {index < visibleRowsByCurrency.length - 1 ? (
                <tr aria-hidden="true">
                  <td className="p-0" colSpan={6}>
                    <div className="h-4" />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
          {!visibleRowsByCurrency.length ? (
            <tr>
              <td className="px-3 py-4 text-center text-muted" colSpan={6}>
                No Credit Big Book cashflow data matches the selected filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
