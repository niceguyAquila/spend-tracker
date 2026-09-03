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
import { handleUnauthorizedResponse } from "@/lib/client/auth-fetch";

const COLUMN_COUNT = 7;
const CURRENCY_ORDER = ["IDR", "MYR", "USDT", "TRX"] as const;

type SortKey = "vendor_name" | "actor_display_name" | "currency" | "outstanding";

export type OutstandingDetailFilters = {
  dateFrom?: string;
  dateTo?: string;
};

type Props = {
  rows: BigBookVendorActorOutstandingRow[];
  detailFilters?: OutstandingDetailFilters;
};

type DetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; rows: BigBookVendorActorOutstandingEntry[]; totalCount: number };

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

  // Stable secondary: currency then outstanding desc.
  const currencyDiff =
    CURRENCY_ORDER.indexOf(a.currency) - CURRENCY_ORDER.indexOf(b.currency);
  if (currencyDiff !== 0) return currencyDiff;
  return b.outstanding - a.outstanding;
}

function detailCacheKey(row: BigBookVendorActorOutstandingRow, filters?: OutstandingDetailFilters) {
  return `${row.row_key}:${filters?.dateFrom ?? ""}:${filters?.dateTo ?? ""}`;
}

function signedAmount(entry: BigBookVendorActorOutstandingEntry) {
  return entry.entry_direction === "spending" ? -entry.amount : entry.amount;
}

export function BigBookVendorActorOutstandingTable({ rows, detailFilters }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("currency");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [detailsByKey, setDetailsByKey] = useState<Record<string, DetailState>>({});

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

  const loadDetails = useCallback(
    async (row: BigBookVendorActorOutstandingRow) => {
      const cacheKey = detailCacheKey(row, detailFilters);
      const params = new URLSearchParams();
      params.set("actorId", row.actor_id);
      params.set("currency", row.currency);
      params.set("vendorId", row.vendor_id ?? "none");
      if (detailFilters?.dateFrom) params.set("dateFrom", detailFilters.dateFrom);
      if (detailFilters?.dateTo) params.set("dateTo", detailFilters.dateTo);

      try {
        const response = await fetch(
          `/api/big-book/vendor-actor-outstanding/entries?${params.toString()}`
        );
        if (handleUnauthorizedResponse(response)) return;
        const data = await response.json();
        if (!response.ok) {
          const message =
            typeof data?.error === "string" ? data.error : "Failed to load open credits.";
          setDetailsByKey((prev) => ({ ...prev, [cacheKey]: { status: "error", message } }));
          return;
        }
        const nextRows: BigBookVendorActorOutstandingEntry[] = Array.isArray(data?.rows)
          ? data.rows
          : [];
        const totalCount = typeof data?.totalCount === "number" ? data.totalCount : nextRows.length;
        setDetailsByKey((prev) => ({
          ...prev,
          [cacheKey]: { status: "ok", rows: nextRows, totalCount }
        }));
      } catch {
        setDetailsByKey((prev) => ({
          ...prev,
          [cacheKey]: { status: "error", message: "Failed to load open credits." }
        }));
      }
    },
    [detailFilters]
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

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="data-table min-w-[900px]">
        <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
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
            <th className="px-3 py-2">Open Credits</th>
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
                onToggle={() => toggleExpanded(row)}
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
              </tr>
            ))}
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function OutstandingSummaryRows({
  row,
  index,
  expanded,
  details,
  onToggle
}: {
  row: BigBookVendorActorOutstandingRow;
  index: number;
  expanded: boolean;
  details: DetailState | undefined;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={`cursor-pointer border-b border-[rgb(var(--border))] ${rowStripeClass(index)}`}
        onClick={onToggle}
      >
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
              onToggle();
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
      </tr>
      {expanded ? (
        <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/50">
          <td className="px-3 py-3" colSpan={COLUMN_COUNT}>
            <OutstandingNestedTable details={details} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function OutstandingNestedTable({ details }: { details: DetailState | undefined }) {
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