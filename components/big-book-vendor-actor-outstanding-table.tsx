"use client";

import { useMemo, useState } from "react";
import type { BigBookVendorActorOutstandingRow } from "@/lib/types";
import { formatAmount, getAmountColorClass } from "@/lib/display-format";
import { TableEmptyState } from "@/components/ui/table-empty-state";
import { rowStripeClass } from "@/lib/ui/table";

const COLUMN_COUNT = 6;
const CURRENCY_ORDER = ["IDR", "MYR", "USDT", "TRX"] as const;

type SortKey = "vendor_name" | "actor_display_name" | "currency" | "outstanding";

type Props = {
  rows: BigBookVendorActorOutstandingRow[];
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

  // Stable secondary: currency then outstanding desc.
  const currencyDiff =
    CURRENCY_ORDER.indexOf(a.currency) - CURRENCY_ORDER.indexOf(b.currency);
  if (currencyDiff !== 0) return currencyDiff;
  return b.outstanding - a.outstanding;
}

export function BigBookVendorActorOutstandingTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("currency");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="data-table min-w-[900px]">
        <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
          <tr>
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
          {sortedRows.map((row, index) => (
            <tr
              key={row.row_key}
              className={`border-b border-[rgb(var(--border))] ${rowStripeClass(index)}`}
            >
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
          ))}
          {!rows.length ? (
            <TableEmptyState colSpan={COLUMN_COUNT} message="No open credits right now." />
          ) : null}
        </tbody>
        {currencySubtotals.length ? (
          <tfoot className="border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]">
            {currencySubtotals.map((subtotal) => (
              <tr key={subtotal.currency}>
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
