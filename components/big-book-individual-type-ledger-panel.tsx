"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTablePagination } from "@/lib/table-pagination";
import { TablePaginationBar } from "@/components/ui/table-pagination-bar";
import { Modal } from "@/components/ui/modal";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import type { BigBookEntry, BigBookLedgerType, BigBookMonthlyCurrencyRow } from "@/lib/types";
import { formatAmount, formatDateDisplay, getAmountColorClass } from "@/lib/display-format";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { TableEmptyState } from "@/components/ui/table-empty-state";
import { rowStripeClass } from "@/lib/ui/table";
import { handleUnauthorizedResponse } from "@/lib/client/auth-fetch";

type Props = {
  types: BigBookLedgerType[];
};

function formatSignedAmount(value: number, currencyCode: "IDR" | "MYR" | "USDT") {
  const prefix = currencyCode === "IDR" ? "Rp" : currencyCode === "MYR" ? "RM" : "$";
  const abs = formatAmount(Math.abs(value), { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (value < 0) return `-${prefix} ${abs}`;
  return `${prefix} ${abs}`;
}

export function BigBookIndividualTypeLedgerPanel({ types }: Props) {
  const activeTypes = useMemo(() => types.filter((row) => row.is_active), [types]);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [pendingTypeId, setPendingTypeId] = useState(activeTypes[0]?.id ?? types[0]?.id ?? "");
  const [isTypeSelectorOpen, setIsTypeSelectorOpen] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<string[]>([]);
  const [directionFilter, setDirectionFilter] = useState<Array<"spending" | "profit">>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getUTCFullYear());
  const [entries, setEntries] = useState<BigBookEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [monthlyRows, setMonthlyRows] = useState<BigBookMonthlyCurrencyRow[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([new Date().getUTCFullYear()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currencyOptions = useMemo(
    () => [
      { value: "IDR", label: "IDR" },
      { value: "MYR", label: "MYR" },
      { value: "USDT", label: "USDT" },
      { value: "TRX", label: "TRX" }
    ],
    []
  );
  const directionOptions = useMemo(
    () => [
      { value: "spending", label: "Out" },
      { value: "profit", label: "In" }
    ],
    []
  );

  const selectedType = types.find((row) => row.id === selectedTypeId) ?? null;
  const entriesPagination = useTablePagination(totalCount);
  const monthlyPagination = useTablePagination(monthlyRows.length);
  const pagedMonthlyRows = useMemo(() => {
    const start = monthlyPagination.page * monthlyPagination.pageSize;
    return monthlyRows.slice(start, start + monthlyPagination.pageSize);
  }, [monthlyRows, monthlyPagination.page, monthlyPagination.pageSize]);

  const grandTotals = useMemo(
    () =>
      monthlyRows.reduce(
        (acc, row) => ({
          IDR: acc.IDR + row.totals.IDR,
          MYR: acc.MYR + row.totals.MYR,
          USDT: acc.USDT + row.totals.USDT
        }),
        { IDR: 0, MYR: 0, USDT: 0 }
      ),
    [monthlyRows]
  );

  const loadTypeLedger = useCallback(async () => {
    if (!selectedTypeId) {
      setEntries([]);
      setTotalCount(0);
      setMonthlyRows([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("typeId", selectedTypeId);
      params.set("year", String(selectedYear));
      params.set("page", String(entriesPagination.page));
      params.set("pageSize", String(entriesPagination.pageSize));
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      for (const currency of currencyFilter) params.append("currencyCode", currency);
      for (const direction of directionFilter) params.append("direction", direction);

      const response = await fetch(`/api/big-book/type-ledger?${params.toString()}`);
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data?.error === "string" ? data.error : "Failed to load type ledger.");
        return;
      }
      setEntries(Array.isArray(data?.entries) ? data.entries : []);
      setTotalCount(typeof data?.totalCount === "number" ? data.totalCount : 0);
      setMonthlyRows(Array.isArray(data?.monthlyRows) ? data.monthlyRows : []);
      if (Array.isArray(data?.availableYears) && data.availableYears.length) {
        setAvailableYears(data.availableYears);
      }
    } catch {
      setError("Failed to load type ledger due to a network error.");
    } finally {
      setLoading(false);
    }
  }, [
    selectedTypeId,
    selectedYear,
    entriesPagination.page,
    entriesPagination.pageSize,
    dateFrom,
    dateTo,
    currencyFilter,
    directionFilter
  ]);

  useEffect(() => {
    void loadTypeLedger();
  }, [loadTypeLedger]);

  useEffect(() => {
    entriesPagination.setPage(0);
  }, [dateFrom, dateTo, currencyFilter, directionFilter, selectedTypeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    monthlyPagination.setPage(0);
  }, [selectedYear, selectedTypeId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Individual Type Ledger</h2>
            <p className="text-sm text-muted">
              {selectedType ? `Showing records for type: ${selectedType.name}` : "Select a type to start."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {loading ? <LoadingIndicator label="Loading..." /> : null}
            <button
              className="btn-secondary"
              onClick={() => {
                setPendingTypeId(selectedTypeId || activeTypes[0]?.id || types[0]?.id || "");
                setIsTypeSelectorOpen(true);
              }}
            >
              {selectedType ? "Change Type" : "Select Type"}
            </button>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-[rgb(var(--danger))]">{error}</p> : null}
      </section>

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-[rgb(var(--text))]">Monthly Type Summary</h3>
          <label className="text-sm text-muted">
            <span className="mr-2">Year</span>
            <select
              className="field inline-block w-auto"
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[680px]">
            <thead className="border-b text-left bg-[rgb(var(--surface-muted))] text-[rgb(var(--text))]">
              <tr>
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2">IDR</th>
                <th className="px-3 py-2">MYR</th>
                <th className="px-3 py-2">USDT</th>
              </tr>
            </thead>
            <tbody>
              {pagedMonthlyRows.map((row, index) => (
                <tr key={row.month_label} className={`border-b ${rowStripeClass(index)}`}>
                  <td className="px-3 py-2 font-medium">{row.month_label}</td>
                  <td className={`px-3 py-2 ${getAmountColorClass(row.totals.IDR)}`}>
                    {formatSignedAmount(row.totals.IDR, "IDR")}
                  </td>
                  <td className={`px-3 py-2 ${getAmountColorClass(row.totals.MYR)}`}>
                    {formatSignedAmount(row.totals.MYR, "MYR")}
                  </td>
                  <td className={`px-3 py-2 ${getAmountColorClass(row.totals.USDT)}`}>
                    {formatSignedAmount(row.totals.USDT, "USDT")}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold bg-[rgb(var(--surface-muted)/0.65)] text-[rgb(var(--text))]">
                <td className="px-3 py-2">Total ({selectedYear})</td>
                <td className={`px-3 py-2 ${getAmountColorClass(grandTotals.IDR)}`}>
                  {formatSignedAmount(grandTotals.IDR, "IDR")}
                </td>
                <td className={`px-3 py-2 ${getAmountColorClass(grandTotals.MYR)}`}>
                  {formatSignedAmount(grandTotals.MYR, "MYR")}
                </td>
                <td className={`px-3 py-2 ${getAmountColorClass(grandTotals.USDT)}`}>
                  {formatSignedAmount(grandTotals.USDT, "USDT")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <TablePaginationBar
          totalCount={monthlyRows.length}
          page={monthlyPagination.page}
          setPage={monthlyPagination.setPage}
          pageSize={monthlyPagination.pageSize}
          setPageSize={monthlyPagination.setPageSize}
          pageCount={monthlyPagination.pageCount}
          rangeLabel={monthlyPagination.rangeLabel}
        />
      </section>

      <section className="card">
        <h3 className="text-base font-semibold text-[rgb(var(--text))]">Type Records With Filters</h3>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm text-muted">
            <span className="mb-1 block">Date From</span>
            <input
              className="field w-full"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label className="text-sm text-muted">
            <span className="mb-1 block">Date To</span>
            <input
              className="field w-full"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
          <label className="text-sm text-muted">
            <span className="mb-1 block">Currency</span>
            <SearchableMultiSelect
              label="Currency"
              selectedValues={currencyFilter}
              options={currencyOptions}
              onChange={setCurrencyFilter}
              searchPlaceholder="Search currency..."
            />
          </label>
          <label className="text-sm text-muted">
            <span className="mb-1 block">Cash Flow</span>
            <SearchableMultiSelect
              label="Cash Flow"
              selectedValues={directionFilter}
              options={directionOptions}
              onChange={(next) => setDirectionFilter(next as Array<"spending" | "profit">)}
              searchPlaceholder="Search direction..."
            />
          </label>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="data-table data-table-zebra min-w-[1100px]">
            <thead className="text-[rgb(var(--text))]">
              <tr>
                <th>Date</th>
                <th>Cash Flow</th>
                <th>Type</th>
                <th>Vendor Type</th>
                <th>Vendor Name</th>
                <th>Explanation</th>
                <th>Amount</th>
                <th>Actor</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-3 py-2">{formatDateDisplay(entry.entry_date)}</td>
                  <td className="px-3 py-2">{entry.entry_direction === "profit" ? "In" : "Out"}</td>
                  <td className="px-3 py-2">{entry.type_name}</td>
                  <td className="px-3 py-2">{entry.vendor_type_name ?? "-"}</td>
                  <td className="px-3 py-2">{entry.vendor_name ?? "-"}</td>
                  <td className="px-3 py-2">{entry.explanation}</td>
                  <td
                    className={`px-3 py-2 ${getAmountColorClass(
                      entry.entry_direction === "spending" ? -entry.amount : entry.amount
                    )}`}
                  >
                    {entry.currency_code}{" "}
                    {formatAmount(entry.amount, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </td>
                  <td className="px-3 py-2">{entry.actor_display_name}</td>
                </tr>
              ))}
              {!entries.length ? (
                <TableEmptyState
                  colSpan={8}
                  message={
                    selectedType
                      ? "No records found for this type and filters."
                      : "No type selected. Click Select Type to begin."
                  }
                />
              ) : null}
            </tbody>
          </table>
        </div>
        <TablePaginationBar
          totalCount={totalCount}
          page={entriesPagination.page}
          setPage={entriesPagination.setPage}
          pageSize={entriesPagination.pageSize}
          setPageSize={entriesPagination.setPageSize}
          pageCount={entriesPagination.pageCount}
          rangeLabel={entriesPagination.rangeLabel}
        />
      </section>

      <Modal
        open={isTypeSelectorOpen}
        onOpenChange={setIsTypeSelectorOpen}
        title="Select Ledger Type"
        dismissible
        closeOnBackdrop
        footer={
          <button
            className="btn"
            disabled={!pendingTypeId}
            onClick={() => {
              if (!pendingTypeId) return;
              setSelectedTypeId(pendingTypeId);
              setIsTypeSelectorOpen(false);
            }}
          >
            Continue
          </button>
        }
      >
        <label className="text-sm text-muted">
          <span className="mb-1 block">Ledger Type</span>
          <select
            className="field w-full"
            value={pendingTypeId}
            onChange={(event) => setPendingTypeId(event.target.value)}
          >
            <option value="">Select type...</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.code} - {type.name}
              </option>
            ))}
          </select>
        </label>
      </Modal>
    </div>
  );
}
