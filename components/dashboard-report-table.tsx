"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { TablePaginationBar } from "@/components/ui/table-pagination-bar";
import { DEFAULT_PAGE_SIZE, type PageSize } from "@/lib/table-pagination";

type PivotRow = {
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  byMonth: Record<string, number>;
  subtotal: number;
};

type RowChunk = {
  categoryId: string;
  categoryName: string;
  rows: PivotRow[];
  partIndex: number;
  partCount: number;
  rowBackgroundColor?: string;
};

type Props = {
  monthColumns: string[];
  rows: PivotRow[];
  categorySubtotals: Record<string, { byMonth: Record<string, number>; subtotal: number }>;
  monthGrandTotals: Record<string, number>;
};

const CATEGORY_ROW_COLORS: Record<string, string> = {
  "Pengeluaran Tetap": "#c6e0b4",
  "Pengeluaran Variable": "#fce4d6",
  "Biaya Bank": "#fff2cc",
  "Transfer Keluar": "#d9e1f2"
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatMonthLabel(monthKey: string) {
  const date = new Date(`${monthKey}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(date);
}

function sumByMonthForRows(rows: PivotRow[], monthKeys: string[]) {
  const byMonth: Record<string, number> = {};
  for (const m of monthKeys) {
    byMonth[m] = rows.reduce((sum, r) => sum + (r.byMonth[m] ?? 0), 0);
  }
  return byMonth;
}

/**
 * Splits each category’s subcategory rows into chunks of at most `rowBudget`, then
 * greedily packs chunks into pages so each page has at most `rowBudget` data rows.
 */
function buildPivotPages(
  order: string[],
  allRows: PivotRow[],
  rowBudget: number,
  colorMap: typeof CATEGORY_ROW_COLORS
): RowChunk[][] {
  if (!allRows.length || !order.length) {
    return [];
  }
  const chunks: RowChunk[] = [];
  for (const categoryId of order) {
    const categoryRows = allRows.filter((row) => row.categoryId === categoryId);
    if (!categoryRows.length) {
      continue;
    }
    const categoryName = categoryRows[0]?.categoryName ?? "-";
    const rowBackgroundColor = colorMap[categoryName];
    const n = categoryRows.length;
    const partCount = Math.max(1, Math.ceil(n / rowBudget));
    for (let p = 0; p * rowBudget < n; p += 1) {
      const slice = categoryRows.slice(p * rowBudget, p * rowBudget + rowBudget);
      const partIndex = p + 1;
      chunks.push({ categoryId, categoryName, rows: slice, partIndex, partCount, rowBackgroundColor });
    }
  }
  if (!chunks.length) {
    return [];
  }

  const pages: RowChunk[][] = [];
  let current: RowChunk[] = [];
  let count = 0;
  for (const c of chunks) {
    if (count + c.rows.length > rowBudget && current.length) {
      pages.push(current);
      current = [c];
      count = c.rows.length;
    } else {
      current.push(c);
      count += c.rows.length;
    }
  }
  if (current.length) {
    pages.push(current);
  }
  return pages;
}

export function DashboardReportTable({ monthColumns, rows, categorySubtotals, monthGrandTotals }: Props) {
  const [page, setPage] = useState(0);
  const [rowBudget, setRowBudget] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  const categoryOrder = useMemo(() => Array.from(new Set(rows.map((r) => r.categoryId))), [rows]);

  const pageGroups = useMemo(
    () => buildPivotPages(categoryOrder, rows, rowBudget, CATEGORY_ROW_COLORS),
    [categoryOrder, rowBudget, rows]
  );

  const pageCount = pageGroups.length;

  useEffect(() => {
    setPage(0);
  }, [rowBudget, categoryOrder, rows.length]);

  useEffect(() => {
    if (pageCount === 0) {
      if (page !== 0) {
        setPage(0);
      }
      return;
    }
    if (page > pageCount - 1) {
      setPage(pageCount - 1);
    }
  }, [page, pageCount]);

  return (
    <section className="card">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Dashboard Report</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[980px] text-sm">
          <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
            <tr>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Sub-category</th>
              {monthColumns.map((monthKey) => (
                <th key={monthKey} className="px-3 py-2 text-right">
                  {formatMonthLabel(monthKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length && pageGroups[page]
              ? pageGroups[page]!.map((chunk, chunkIndex) => {
                  const { categoryName, partIndex, partCount, rowBackgroundColor } = chunk;
                  const subtotalByMonth =
                    partCount > 1
                      ? sumByMonthForRows(chunk.rows, monthColumns)
                      : (categorySubtotals[chunk.categoryId]?.byMonth ?? {});

                  const thisPage = pageGroups[page]!;
                  const next = thisPage[chunkIndex + 1];
                  const showSpacerBetweenCategories =
                    next !== undefined && next.categoryId !== chunk.categoryId;

                  return (
                    <Fragment key={`${chunk.categoryId}:${partIndex}`}>
                      {chunk.rows.map((row, index) => (
                        <tr
                          key={`${row.categoryId}:${row.subcategoryId}`}
                          className={`border-b border-[rgb(var(--border))] ${rowBackgroundColor ? "text-slate-900" : ""}`}
                          style={rowBackgroundColor ? { backgroundColor: rowBackgroundColor } : undefined}
                        >
                          <td className="px-3 py-2 font-medium">
                            {index === 0 && partIndex === 1 ? categoryName : ""}
                          </td>
                          <td className="px-3 py-2">{row.subcategoryName}</td>
                          {monthColumns.map((monthKey) => (
                            <td key={monthKey} className="px-3 py-2 text-right">
                              {formatCurrency(row.byMonth[monthKey] ?? 0)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr
                        className="border-b border-[rgb(var(--border))] text-slate-900"
                        style={{ backgroundColor: "#ffe699" }}
                      >
                        <td className="px-3 py-2 font-semibold" colSpan={2}>
                          {partCount > 1
                            ? `${categoryName} Subtotal (part ${partIndex} of ${partCount})`
                            : `${categoryName} Subtotal`}
                        </td>
                        {monthColumns.map((monthKey) => (
                          <td key={monthKey} className="px-3 py-2 text-right font-semibold">
                            {formatCurrency(subtotalByMonth[monthKey] ?? 0)}
                          </td>
                        ))}
                      </tr>
                      {showSpacerBetweenCategories ? (
                        <tr>
                          <td colSpan={monthColumns.length + 2} className="h-3 p-0" />
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              : null}
            {!rows.length ? (
              <tr>
                <td colSpan={monthColumns.length + 2} className="px-3 py-6 text-center text-slate-500">
                  No data found for the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot style={{ backgroundColor: "#1f4e78" }} className="text-white">
            <tr>
              <td className="px-3 py-2 font-semibold" colSpan={2}>
                Grand Total
              </td>
              {monthColumns.map((monthKey) => (
                <td key={monthKey} className="px-3 py-2 text-right font-semibold">
                  {formatCurrency(monthGrandTotals[monthKey] ?? 0)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {rows.length > 0 && pageCount > 0 ? (
        <TablePaginationBar
          totalCount={rows.length}
          show
          page={page}
          setPage={setPage}
          pageSize={rowBudget}
          setPageSize={(n) => setRowBudget(n)}
          pageCount={pageCount}
          rangeLabel={`Page ${page + 1} of ${pageCount} · at most ${rowBudget} subcategory row(s) per page`}
        />
      ) : null}
    </section>
  );
}
