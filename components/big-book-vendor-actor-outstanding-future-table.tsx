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
import type { OutstandingDetailFilters } from "@/components/big-book-vendor-actor-outstanding-table";

const COLUMN_COUNT = 8;
const CURRENCY_ORDER = ["IDR", "MYR", "USDT", "TRX"] as const;
const WARNING_AMOUNT_CLASS = "text-[rgb(var(--warning))]";

type SortKey = "vendor_name" | "actor_display_name" | "currency" | "outstanding";

type Props = {
  rows: BigBookVendorActorOutstandingRow[];
  detailFilters?: OutstandingDetailFilters;
  onActualized?: () => void;
};

type DetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; rows: BigBookVendorActorOutstandingEntry[]; totalCount: number };

type PendingActualize = {
  credits: Array<{ id: string; expected_updated_at: string; explanation: string; amount: number }>;
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
  return `future:${row.row_key}:${filters?.dateFrom ?? ""}:${filters?.dateTo ?? ""}`;
}

function extractApiError(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export function BigBookVendorActorOutstandingFutureTable({
  rows,
  detailFilters,
  onActualized
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("currency");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [detailsByKey, setDetailsByKey] = useState<Record<string, DetailState>>({});
  const [pendingActualize, setPendingActualize] = useState<PendingActualize | null>(null);
  const [actualizeSubmitting, setActualizeSubmitting] = useState(false);
  const [actualizeError, setActualizeError] = useState<string | null>(null);
  const [actualizeMessage, setActualizeMessage] = useState<string | null>(null);
  const [rowActualizeLoadingKey, setRowActualizeLoadingKey] = useState<string | null>(null);

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
      params.set("creditKind", "future");
      if (detailFilters?.dateFrom) params.set("dateFrom", detailFilters.dateFrom);
      if (detailFilters?.dateTo) params.set("dateTo", detailFilters.dateTo);

      const response = await fetch(
        `/api/big-book/vendor-actor-outstanding/entries?${params.toString()}`
      );
      if (handleUnauthorizedResponse(response)) return [];
      const data = await response.json();
      if (!response.ok) {
        const message =
          typeof data?.error === "string" ? data.error : "Failed to load Future Credits.";
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
      try {
        await fetchDetailRows(row);
      } catch {
        // fetchDetailRows already stores the error state.
      }
    },
    [fetchDetailRows]
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

  async function prepareActualizeFromRow(row: BigBookVendorActorOutstandingRow) {
    setActualizeError(null);
    setActualizeMessage(null);
    setRowActualizeLoadingKey(row.row_key);
    try {
      const detailRows = await fetchDetailRows(row);
      if (!detailRows.length) {
        setActualizeError("No open Future Credits found for this vendor row.");
        return;
      }
      setPendingActualize({
        credits: detailRows.map((entry) => ({
          id: entry.id,
          expected_updated_at: entry.updated_at,
          explanation: entry.explanation,
          amount: entry.amount
        })),
        currency: row.currency,
        label: `${row.vendor_name} · Actor ${row.actor_display_name}`
      });
    } catch (error) {
      setActualizeError(
        error instanceof Error ? error.message : "Failed to load Future Credits to actualize."
      );
    } finally {
      setRowActualizeLoadingKey(null);
    }
  }

  function prepareActualizeFromEntry(entry: BigBookVendorActorOutstandingEntry) {
    setActualizeError(null);
    setActualizeMessage(null);
    setPendingActualize({
      credits: [
        {
          id: entry.id,
          expected_updated_at: entry.updated_at,
          explanation: entry.explanation,
          amount: entry.amount
        }
      ],
      currency: entry.currency_code,
      label: entry.explanation
    });
  }

  async function submitActualize() {
    if (!pendingActualize) return;
    setActualizeSubmitting(true);
    setActualizeError(null);
    try {
      for (const credit of pendingActualize.credits) {
        const response = await secureFetch("/api/big-book/entries/actualize", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: credit.id,
            expected_updated_at: credit.expected_updated_at,
            actualized: true
          })
        });
        if (handleUnauthorizedResponse(response)) return;
        const data = await response.json();
        if (!response.ok) {
          setActualizeError(extractApiError(data.error, "Failed to actualize Future Credit."));
          return;
        }
      }
      setActualizeMessage(
        pendingActualize.credits.length === 1
          ? "Future Credit actualized to Credit."
          : `Actualized ${pendingActualize.credits.length} Future Credits to Credit.`
      );
      setPendingActualize(null);
      setDetailsByKey({});
      setExpandedKeys(new Set());
      onActualized?.();
    } catch {
      setActualizeError("Failed to actualize Future Credit due to a network error.");
    } finally {
      setActualizeSubmitting(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {actualizeMessage ? (
          <p className="text-sm text-[rgb(var(--success))]">{actualizeMessage}</p>
        ) : null}
        {actualizeError && !pendingActualize ? (
          <p className="text-sm text-[rgb(var(--danger))]">{actualizeError}</p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="data-table min-w-[900px]">
          <thead>
            <tr>
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
              <th className="px-3 py-2">Open Future Credits</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, index) => {
              const cacheKey = detailCacheKey(row, detailFilters);
              const expanded = expandedKeys.has(cacheKey);
              const details = detailsByKey[cacheKey];
              return (
                <FutureOutstandingSummaryRows
                  key={row.row_key}
                  row={row}
                  index={index}
                  expanded={expanded}
                  details={details}
                  actualizeLoading={rowActualizeLoadingKey === row.row_key}
                  onToggleExpand={() => toggleExpanded(row)}
                  onActualizeRow={() => void prepareActualizeFromRow(row)}
                  onActualizeEntry={prepareActualizeFromEntry}
                />
              );
            })}
            {!rows.length ? (
              <TableEmptyState colSpan={COLUMN_COUNT} message="No open Future Credits right now." />
            ) : null}
          </tbody>
          {currencySubtotals.length ? (
            <tfoot className="border-t border-[rgb(var(--border))] bg-[rgb(var(--warning)/0.08)]">
              {currencySubtotals.map((subtotal) => (
                <tr key={subtotal.currency}>
                  <td className="px-3 py-2" aria-hidden="true" />
                  <td className="px-3 py-2 font-medium" colSpan={3}>
                    Subtotal
                  </td>
                  <td className="px-3 py-2 font-medium">{subtotal.currency}</td>
                  <td className={`px-3 py-2 font-medium ${WARNING_AMOUNT_CLASS}`}>
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
        open={Boolean(pendingActualize)}
        onOpenChange={(open) => {
          if (!open && !actualizeSubmitting) {
            setPendingActualize(null);
            setActualizeError(null);
          }
        }}
        title="Actualize Future Credit?"
        confirmLabel={
          pendingActualize && pendingActualize.credits.length > 1
            ? `Actualize ${pendingActualize.credits.length} credits`
            : "Actualize to Credit"
        }
        confirming={actualizeSubmitting}
        closeOnBackdrop={false}
        confirmDisabled={!pendingActualize}
        onConfirm={() => void submitActualize()}
        description={
          pendingActualize ? (
            <div className="space-y-3 text-sm">
              <p>
                Actualizing{" "}
                <span className="font-medium">{pendingActualize.credits.length}</span> Future
                Credit{pendingActualize.credits.length === 1 ? "" : "s"} for{" "}
                <span className="font-medium">{pendingActualize.label}</span>.
              </p>
              <p>
                This moves them into Outstanding Credit (included in cash totals) so they can be
                settled.
              </p>
              {actualizeError ? <p className="text-[rgb(var(--danger))]">{actualizeError}</p> : null}
            </div>
          ) : null
        }
      />
    </div>
  );
}

function FutureOutstandingSummaryRows({
  row,
  index,
  expanded,
  details,
  actualizeLoading,
  onToggleExpand,
  onActualizeRow,
  onActualizeEntry
}: {
  row: BigBookVendorActorOutstandingRow;
  index: number;
  expanded: boolean;
  details: DetailState | undefined;
  actualizeLoading: boolean;
  onToggleExpand: () => void;
  onActualizeRow: () => void;
  onActualizeEntry: (entry: BigBookVendorActorOutstandingEntry) => void;
}) {
  return (
    <>
      <tr className={`border-b border-[rgb(var(--border))] ${rowStripeClass(index)}`}>
        <td className="px-3 py-2">
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-xs"
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Collapse Future Credits for ${row.vendor_name}`
                : `Expand Future Credits for ${row.vendor_name}`
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
        <td className={`px-3 py-2 font-medium ${WARNING_AMOUNT_CLASS}`}>
          {formatAmount(row.outstanding, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4
          })}
        </td>
        <td className="px-3 py-2">{row.open_credit_count}</td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            className="btn-secondary btn-sm !border-[rgb(var(--warning)/0.45)] !text-[rgb(var(--warning))] hover:!bg-[rgb(var(--warning)/0.12)]"
            disabled={actualizeLoading || row.open_credit_count === 0}
            onClick={(event) => {
              event.stopPropagation();
              onActualizeRow();
            }}
          >
            {actualizeLoading ? "Loading…" : "Actualize"}
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--warning)/0.06)]">
          <td className="px-3 py-3" colSpan={COLUMN_COUNT}>
            <FutureOutstandingNestedTable
              details={details}
              onActualizeEntry={onActualizeEntry}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function FutureOutstandingNestedTable({
  details,
  onActualizeEntry
}: {
  details: DetailState | undefined;
  onActualizeEntry: (entry: BigBookVendorActorOutstandingEntry) => void;
}) {
  if (!details || details.status === "loading") {
    return <p className="text-sm text-muted">Loading Future Credits…</p>;
  }
  if (details.status === "error") {
    return <p className="text-sm text-[rgb(var(--danger))]">{details.message}</p>;
  }
  if (!details.rows.length) {
    return <p className="text-sm text-muted">No open Future Credits for this vendor and actor.</p>;
  }

  const truncated = details.totalCount > details.rows.length;

  return (
    <div className="space-y-2">
      {truncated ? (
        <p className="text-xs text-muted">
          Showing first {details.rows.length} of {details.totalCount} Future Credits.
        </p>
      ) : null}
      <table className="data-table min-w-full">
        <thead className="text-xs text-muted">
          <tr>
            <th className="px-3 py-1.5 font-medium">Date</th>
            <th className="px-3 py-1.5 font-medium">In/Out</th>
            <th className="px-3 py-1.5 font-medium">Type</th>
            <th className="px-3 py-1.5 font-medium">Explanation</th>
            <th className="px-3 py-1.5 font-medium">Amount</th>
            <th className="px-3 py-1.5 font-medium">Remark</th>
            <th className="px-3 py-1.5 font-medium">Ledger</th>
            <th className="px-3 py-1.5 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {details.rows.map((entry) => {
            const amount =
              entry.entry_direction === "spending" ? -entry.amount : entry.amount;
            return (
              <tr key={entry.id} className="border-b border-[rgb(var(--border))] align-top">
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
                <td className="px-3 py-1.5">
                  <div className="space-y-1">
                    <div>{entry.explanation}</div>
                    <span className="inline-flex rounded bg-[rgb(var(--warning)/0.18)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--warning))]">
                      Future Credit
                    </span>
                  </div>
                </td>
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
                <td className="px-3 py-1.5 text-right">
                  <button
                    type="button"
                    className="btn-secondary btn-sm !border-[rgb(var(--warning)/0.45)] !text-[rgb(var(--warning))] hover:!bg-[rgb(var(--warning)/0.12)]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onActualizeEntry(entry);
                    }}
                  >
                    Actualize
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
