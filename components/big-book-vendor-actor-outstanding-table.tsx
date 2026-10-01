"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type {
  BigBookVendorActorOutstandingEntry,
  BigBookVendorActorOutstandingRow
} from "@/lib/types";
import { formatAmount, formatDateDisplay, getAmountColorClass } from "@/lib/display-format";
import { TableEmptyState } from "@/components/ui/table-empty-state";
import { rowStripeClass } from "@/lib/ui/table";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const COLUMN_COUNT = 9;
const CURRENCY_ORDER = ["IDR", "MYR", "USDT", "TRX"] as const;

type SortKey = "vendor_name" | "actor_display_name" | "currency" | "outstanding";
type BulkSettleMode = "single" | "per_credit";

export type OutstandingDetailFilters = {
  dateFrom?: string;
  dateTo?: string;
};

type Props = {
  rows: BigBookVendorActorOutstandingRow[];
  detailFilters?: OutstandingDetailFilters;
  /** Called after a successful bulk settle so the parent can refresh metrics/ledger. */
  onSettled?: () => void;
};

type DetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; rows: BigBookVendorActorOutstandingEntry[]; totalCount: number };

type PendingBulkSettle = {
  creditIds: string[];
  totalAmount: number;
  currency: string;
  label: string;
};

function compareRows(
  a: BigBookVendorActorOutstandingRow,
  b: BigBookVendorActorOutstandingRow,
  sortKey: SortKey,
  sortDir: "asc" | "desc"
) {
  const dir = sortDir === "asc" ? 1 : -1;
  if (sortKey === "outstanding") {
    if (a.outstanding !== b.outstanding) return (a.outstanding - b.outstanding) * dir;
  } else if (sortKey === "currency") {
    const aIdx = CURRENCY_ORDER.indexOf(a.currency);
    const bIdx = CURRENCY_ORDER.indexOf(b.currency);
    if (aIdx !== bIdx) return (aIdx - bIdx) * dir;
  } else {
    const left = a[sortKey];
    const right = b[sortKey];
    if (left !== right) return left.localeCompare(right) * dir;
  }

  const currencyDiff = CURRENCY_ORDER.indexOf(a.currency) - CURRENCY_ORDER.indexOf(b.currency);
  if (currencyDiff !== 0) return currencyDiff;
  return b.outstanding - a.outstanding;
}

function detailCacheKey(row: BigBookVendorActorOutstandingRow, filters?: OutstandingDetailFilters) {
  return `${row.row_key}:${filters?.dateFrom ?? ""}:${filters?.dateTo ?? ""}`;
}

function signedAmount(entry: BigBookVendorActorOutstandingEntry) {
  return entry.entry_direction === "spending" ? -entry.amount : entry.amount;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function extractApiError(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export function BigBookVendorActorOutstandingTable({ rows, detailFilters, onSettled }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("currency");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [detailsByKey, setDetailsByKey] = useState<Record<string, DetailState>>({});
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const [selectedCreditIds, setSelectedCreditIds] = useState<Set<string>>(() => new Set());
  const [pendingSettle, setPendingSettle] = useState<PendingBulkSettle | null>(null);
  const [settleMode, setSettleMode] = useState<BulkSettleMode>("single");
  const [settleSubmitting, setSettleSubmitting] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [settleMessage, setSettleMessage] = useState<string | null>(null);
  const [rowSettleLoadingKey, setRowSettleLoadingKey] = useState<string | null>(null);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDir)),
    [rows, sortKey, sortDir]
  );

  const currencySubtotals = useMemo(() => {
    const map = new Map<
      BigBookVendorActorOutstandingRow["currency"],
      { outstanding: number; openCount: number }
    >();
    for (const row of rows) {
      const existing = map.get(row.currency) ?? {
        outstanding: 0,
        openCount: 0
      };
      existing.outstanding += row.outstanding;
      existing.openCount += row.open_credit_count;
      map.set(row.currency, existing);
    }
    return CURRENCY_ORDER.flatMap((currency) => {
      const totals = map.get(currency);
      if (!totals) return [];
      return [{ currency, ...totals }];
    });
  }, [rows]);

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === "outstanding" ? "desc" : "asc");
  }

  function sortLabel(label: string, key: SortKey) {
    const marker = sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";
    return `${label}${marker}`;
  }

  const fetchDetailRows = useCallback(
    async (row: BigBookVendorActorOutstandingRow): Promise<BigBookVendorActorOutstandingEntry[]> => {
      const cacheKey = detailCacheKey(row, detailFilters);
      const existing = detailsByKey[cacheKey];
      if (existing?.status === "ok") return existing.rows;

      const params = new URLSearchParams();
      params.set("actorId", row.actor_id);
      params.set("currency", row.currency);
      params.set("vendorId", row.vendor_id ?? "none");
      if (detailFilters?.dateFrom) params.set("dateFrom", detailFilters.dateFrom);
      if (detailFilters?.dateTo) params.set("dateTo", detailFilters.dateTo);

      const response = await fetch(
        `/api/big-book/vendor-actor-outstanding/entries?${params.toString()}`
      );
      if (handleUnauthorizedResponse(response)) return [];
      const data = await response.json();
      if (!response.ok) {
        const message =
          typeof data?.error === "string" ? data.error : "Failed to load open credits.";
        setDetailsByKey((prev) => ({ ...prev, [cacheKey]: { status: "error", message } }));
        throw new Error(message);
      }
      const nextRows: BigBookVendorActorOutstandingEntry[] = Array.isArray(data?.rows)
        ? data.rows
        : [];
      const totalCount = typeof data?.totalCount === "number" ? data.totalCount : nextRows.length;
      setDetailsByKey((prev) => ({
        ...prev,
        [cacheKey]: { status: "ok", rows: nextRows, totalCount }
      }));
      return nextRows;
    },
    [detailFilters, detailsByKey]
  );

  const loadDetails = useCallback(
    async (row: BigBookVendorActorOutstandingRow) => {
      const cacheKey = detailCacheKey(row, detailFilters);
      try {
        await fetchDetailRows(row);
      } catch {
        // fetchDetailRows already stores the error state.
        void cacheKey;
      }
    },
    [detailFilters, fetchDetailRows]
  );

  function toggleExpanded(row: BigBookVendorActorOutstandingRow) {
    const cacheKey = detailCacheKey(row, detailFilters);
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(cacheKey)) {
        next.delete(cacheKey);
        return next;
      }
      next.add(cacheKey);
      return next;
    });
    setDetailsByKey((prev) => {
      if (prev[cacheKey]) return prev;
      void loadDetails(row);
      return { ...prev, [cacheKey]: { status: "loading" } };
    });
  }

  function toggleRowSelected(rowKey: string) {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  }

  function toggleCreditSelected(creditId: string) {
    setSelectedCreditIds((prev) => {
      const next = new Set(prev);
      if (next.has(creditId)) next.delete(creditId);
      else next.add(creditId);
      return next;
    });
  }

  async function prepareSettleFromRow(row: BigBookVendorActorOutstandingRow) {
    setSettleError(null);
    setSettleMessage(null);
    setRowSettleLoadingKey(row.row_key);
    try {
      const detailRows = await fetchDetailRows(row);
      if (!detailRows.length) {
        setSettleError("No open credits found for this vendor row.");
        return;
      }
      const totalAmount = detailRows.reduce((sum, entry) => sum + entry.amount, 0);
      setSettleMode("single");
      setPendingSettle({
        creditIds: detailRows.map((entry) => entry.id),
        totalAmount,
        currency: row.currency,
        label: `${row.vendor_name} · Actor ${row.actor_display_name}`
      });
    } catch (error) {
      setSettleError(error instanceof Error ? error.message : "Failed to load credits to settle.");
    } finally {
      setRowSettleLoadingKey(null);
    }
  }

  async function prepareSettleFromSelection() {
    setSettleError(null);
    setSettleMessage(null);
    try {
      const creditIdSet = new Set(selectedCreditIds);
      const amountsById = new Map<string, { amount: number; currency: string }>();

      // Collect credits already loaded from expanded detail.
      for (const details of Object.values(detailsByKey)) {
        if (details.status !== "ok") continue;
        for (const entry of details.rows) {
          if (creditIdSet.has(entry.id)) {
            amountsById.set(entry.id, {
              amount: entry.amount,
              currency: entry.currency_code
            });
          }
        }
      }

      // Resolve selected vendor rows into their open credits.
      const selectedRows = rows.filter((row) => selectedRowKeys.has(row.row_key));
      for (const row of selectedRows) {
        const detailRows = await fetchDetailRows(row);
        for (const entry of detailRows) {
          creditIdSet.add(entry.id);
          amountsById.set(entry.id, {
            amount: entry.amount,
            currency: entry.currency_code
          });
        }
      }

      // For credit-only selections that were not in loaded details, we still need
      // amounts — they should already be in amountsById if their parent was expanded.
      const missing = [...creditIdSet].filter((id) => !amountsById.has(id));
      if (missing.length) {
        setSettleError(
          "Expand the vendor rows for selected credits (or select the vendor row) so amounts can be confirmed."
        );
        return;
      }

      const creditIds = [...creditIdSet];
      if (!creditIds.length) {
        setSettleError("Select at least one vendor row or open credit to settle.");
        return;
      }

      const currencies = new Set(
        creditIds.map((id) => amountsById.get(id)?.currency).filter(Boolean) as string[]
      );
      if (currencies.size > 1 && settleMode === "single") {
        // Still open the dialog; API will reject single mode for mixed currency.
      }

      const totalAmount = creditIds.reduce(
        (sum, id) => sum + (amountsById.get(id)?.amount ?? 0),
        0
      );
      const currencyLabel =
        currencies.size === 1 ? [...currencies][0] : `${currencies.size} currencies`;

      setSettleMode("single");
      setPendingSettle({
        creditIds,
        totalAmount,
        currency: currencyLabel,
        label: `${creditIds.length} selected open credit${creditIds.length === 1 ? "" : "s"}`
      });
    } catch (error) {
      setSettleError(error instanceof Error ? error.message : "Failed to prepare settlement.");
    }
  }

  async function confirmBulkSettle() {
    if (!pendingSettle) return;
    setSettleSubmitting(true);
    setSettleError(null);
    try {
      const response = await secureFetch("/api/big-book/entries/bulk-settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credit_entry_ids: pendingSettle.creditIds,
          mode: settleMode,
          entry_date: todayIsoDate(),
          close_credits: true
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setSettleError(extractApiError(data.error, "Failed to settle selected credits."));
        return;
      }
      setSettleMessage(
        settleMode === "single"
          ? `Created 1 settlement covering ${pendingSettle.creditIds.length} credit(s).`
          : `Created ${pendingSettle.creditIds.length} settlement record(s).`
      );
      setPendingSettle(null);
      setSelectedRowKeys(new Set());
      setSelectedCreditIds(new Set());
      setDetailsByKey({});
      setExpandedKeys(new Set());
      onSettled?.();
    } catch {
      setSettleError("Failed to settle credits due to a network error.");
    } finally {
      setSettleSubmitting(false);
    }
  }

  const selectedCount = selectedRowKeys.size + selectedCreditIds.size;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={selectedCount === 0}
          onClick={() => void prepareSettleFromSelection()}
        >
          Settle selected ({selectedCount || 0})
        </button>
        {settleMessage ? (
          <p className="text-sm text-[rgb(var(--success))]">{settleMessage}</p>
        ) : null}
        {settleError && !pendingSettle ? (
          <p className="text-sm text-[rgb(var(--danger))]">{settleError}</p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="data-table min-w-[980px]">
          <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
            <tr>
              <th className="w-10 px-3 py-2" aria-label="Select" />
              <th className="w-10 px-3 py-2" aria-label="Expand" />
              <th className="px-3 py-2">Vendor Type</th>
              <th className="px-3 py-2">
                <button type="button" className="font-semibold" onClick={() => toggleSort("vendor_name")}>
                  {sortLabel("Vendor (owes)", "vendor_name")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button
                  type="button"
                  className="font-semibold"
                  onClick={() => toggleSort("actor_display_name")}
                >
                  {sortLabel("Actor (owed)", "actor_display_name")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button type="button" className="font-semibold" onClick={() => toggleSort("currency")}>
                  {sortLabel("Currency", "currency")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button type="button" className="font-semibold" onClick={() => toggleSort("outstanding")}>
                  {sortLabel("Outstanding", "outstanding")}
                </button>
              </th>
              <th className="px-3 py-2">Open Credits</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, index) => {
              const cacheKey = detailCacheKey(row, detailFilters);
              const expanded = expandedKeys.has(cacheKey);
              const details = detailsByKey[cacheKey];
              return (
                <OutstandingSummaryRows
                  key={row.row_key}
                  row={row}
                  index={index}
                  expanded={expanded}
                  details={details}
                  selected={selectedRowKeys.has(row.row_key)}
                  selectedCreditIds={selectedCreditIds}
                  settleLoading={rowSettleLoadingKey === row.row_key}
                  onToggleExpand={() => toggleExpanded(row)}
                  onToggleSelected={() => toggleRowSelected(row.row_key)}
                  onToggleCredit={toggleCreditSelected}
                  onSettleRow={() => void prepareSettleFromRow(row)}
                />
              );
            })}
            {!rows.length ? (
              <TableEmptyState colSpan={COLUMN_COUNT} message="No open credits right now." />
            ) : null}
          </tbody>
          {currencySubtotals.length ? (
            <tfoot className="border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]">
              {currencySubtotals.map((subtotal) => (
                <tr key={subtotal.currency}>
                  <td className="px-3 py-2" aria-hidden="true" />
                  <td className="px-3 py-2" aria-hidden="true" />
                  <td className="px-3 py-2 font-medium" colSpan={3}>
                    Subtotal
                  </td>
                  <td className="px-3 py-2 font-medium">{subtotal.currency}</td>
                  <td className={`px-3 py-2 font-medium ${getAmountColorClass(subtotal.outstanding)}`}>
                    {formatAmount(subtotal.outstanding, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 4
                    })}
                  </td>
                  <td className="px-3 py-2 font-medium">{subtotal.openCount}</td>
                  <td className="px-3 py-2" aria-hidden="true" />
                </tr>
              ))}
            </tfoot>
          ) : null}
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(pendingSettle)}
        onOpenChange={(open) => {
          if (!open && !settleSubmitting) {
            setPendingSettle(null);
            setSettleError(null);
          }
        }}
        title="Settle open credits?"
        confirmLabel={settleMode === "single" ? "Create one settlement" : "Create settlement per credit"}
        confirming={settleSubmitting}
        closeOnBackdrop={false}
        confirmDisabled={!pendingSettle}
        onConfirm={confirmBulkSettle}
        description={
          pendingSettle ? (
            <div className="space-y-3 text-sm">
              <p>
                Settling <span className="font-medium">{pendingSettle.creditIds.length}</span> open
                credit{pendingSettle.creditIds.length === 1 ? "" : "s"} for{" "}
                <span className="font-medium">{pendingSettle.label}</span>.
              </p>
              <p>
                Total:{" "}
                <span className="font-medium">
                  {formatAmount(pendingSettle.totalAmount, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 4
                  })}{" "}
                  {pendingSettle.currency}
                </span>
              </p>
              <fieldset className="space-y-2 rounded-md border border-[rgb(var(--border))] p-3">
                <legend className="px-1 text-xs font-medium uppercase text-muted">
                  Settlement records
                </legend>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    className="mt-1"
                    name="bulk-settle-mode"
                    checked={settleMode === "single"}
                    onChange={() => setSettleMode("single")}
                  />
                  <span>
                    <span className="font-medium">One settlement for all</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Default. Creates a single settlement payment covering the selected credits.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    className="mt-1"
                    name="bulk-settle-mode"
                    checked={settleMode === "per_credit"}
                    onChange={() => setSettleMode("per_credit")}
                  />
                  <span>
                    <span className="font-medium">One settlement per credit</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Creates a separate settlement payment for each selected credit.
                    </span>
                  </span>
                </label>
              </fieldset>
              {settleError ? <p className="text-[rgb(var(--danger))]">{settleError}</p> : null}
            </div>
          ) : null
        }
      />
    </div>
  );
}

function OutstandingSummaryRows({
  row,
  index,
  expanded,
  details,
  selected,
  selectedCreditIds,
  settleLoading,
  onToggleExpand,
  onToggleSelected,
  onToggleCredit,
  onSettleRow
}: {
  row: BigBookVendorActorOutstandingRow;
  index: number;
  expanded: boolean;
  details: DetailState | undefined;
  selected: boolean;
  selectedCreditIds: Set<string>;
  settleLoading: boolean;
  onToggleExpand: () => void;
  onToggleSelected: () => void;
  onToggleCredit: (creditId: string) => void;
  onSettleRow: () => void;
}) {
  return (
    <>
      <tr className={`border-b border-[rgb(var(--border))] ${rowStripeClass(index)}`}>
        <td className="px-3 py-2">
          <input
            type="checkbox"
            className="h-4 w-4"
            aria-label={`Select outstanding for ${row.vendor_name}`}
            checked={selected}
            onChange={onToggleSelected}
            onClick={(event) => event.stopPropagation()}
          />
        </td>
        <td className="px-3 py-2">
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-xs"
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Collapse open credits for ${row.vendor_name}`
                : `Expand open credits for ${row.vendor_name}`
            }
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand();
            }}
          >
            {expanded ? "▾" : "▸"}
          </button>
        </td>
        <td className="px-3 py-2">{row.vendor_type_name}</td>
        <td className="px-3 py-2">{row.vendor_name}</td>
        <td className="px-3 py-2">{row.actor_display_name}</td>
        <td className="px-3 py-2">{row.currency}</td>
        <td className={`px-3 py-2 font-medium ${getAmountColorClass(row.outstanding)}`}>
          {formatAmount(row.outstanding, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4
          })}
        </td>
        <td className="px-3 py-2">{row.open_credit_count}</td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={settleLoading || row.open_credit_count === 0}
            onClick={(event) => {
              event.stopPropagation();
              onSettleRow();
            }}
          >
            {settleLoading ? "Loading…" : "Settle"}
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/50">
          <td className="px-3 py-3" colSpan={COLUMN_COUNT}>
            <OutstandingNestedTable
              details={details}
              selectedCreditIds={selectedCreditIds}
              onToggleCredit={onToggleCredit}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function OutstandingNestedTable({
  details,
  selectedCreditIds,
  onToggleCredit
}: {
  details: DetailState | undefined;
  selectedCreditIds: Set<string>;
  onToggleCredit: (creditId: string) => void;
}) {
  if (!details || details.status === "loading") {
    return <p className="text-sm text-muted">Loading open credits…</p>;
  }
  if (details.status === "error") {
    return <p className="text-sm text-[rgb(var(--danger))]">{details.message}</p>;
  }
  if (!details.rows.length) {
    return <p className="text-sm text-muted">No open credits for this vendor and actor.</p>;
  }

  const truncated = details.totalCount > details.rows.length;

  return (
    <div className="space-y-2">
      {truncated ? (
        <p className="text-xs text-muted">
          Showing first {details.rows.length} of {details.totalCount} open credits.
        </p>
      ) : null}
      <table className="data-table min-w-full">
        <thead className="border-b border-[rgb(var(--border))] text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-1.5 font-medium">Select</th>
            <th className="px-3 py-1.5 font-medium">Date</th>
            <th className="px-3 py-1.5 font-medium">In/Out</th>
            <th className="px-3 py-1.5 font-medium">Type</th>
            <th className="px-3 py-1.5 font-medium">Explanation</th>
            <th className="px-3 py-1.5 font-medium">Amount</th>
            <th className="px-3 py-1.5 font-medium">Remark</th>
            <th className="px-3 py-1.5 font-medium">Ledger</th>
          </tr>
        </thead>
        <tbody>
          {details.rows.map((entry) => {
            const amount = signedAmount(entry);
            return (
              <tr key={entry.id} className="border-b border-[rgb(var(--border))] align-top">
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    aria-label={`Select credit ${entry.explanation}`}
                    checked={selectedCreditIds.has(entry.id)}
                    onChange={() => onToggleCredit(entry.id)}
                  />
                </td>
                <td className="px-3 py-1.5">{formatDateDisplay(entry.entry_date)}</td>
                <td className="px-3 py-1.5">
                  <span
                    className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                      entry.entry_direction === "profit"
                        ? "bg-[rgb(var(--success)/0.15)] text-[rgb(var(--success))]"
                        : "bg-[rgb(var(--warning)/0.15)] text-[rgb(var(--warning))]"
                    }`}
                  >
                    {entry.entry_direction === "profit" ? "In" : "Out"}
                  </span>
                </td>
                <td className="px-3 py-1.5">{entry.type_name}</td>
                <td className="px-3 py-1.5">{entry.explanation}</td>
                <td className={`px-3 py-1.5 font-medium tabular-nums ${getAmountColorClass(amount)}`}>
                  {entry.currency_code}{" "}
                  {formatAmount(entry.amount, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 4
                  })}
                </td>
                <td className="px-3 py-1.5">
                  {entry.remark ? entry.remark : <span className="text-xs text-muted">-</span>}
                </td>
                <td className="px-3 py-1.5">
                  <Link
                    href={`/dashboard/big-book?entryId=${entry.id}#ledger-records`}
                    className="text-xs text-[rgb(var(--info))] underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    View in ledger
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
