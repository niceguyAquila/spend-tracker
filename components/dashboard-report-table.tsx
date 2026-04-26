"use client";

import { Fragment } from "react";

type PivotRow = {
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  byMonth: Record<string, number>;
  subtotal: number;
};

type Props = {
  monthColumns: string[];
  rows: PivotRow[];
  categorySubtotals: Record<string, { byMonth: Record<string, number>; subtotal: number }>;
  monthGrandTotals: Record<string, number>;
  title?: string;
  description?: string;
};

const CATEGORY_ROW_COLORS: Record<string, string> = {
  "Pengeluaran Tetap": "rgba(var(--primary), 0.14)",
  "Pengeluaran Variable": "rgba(249, 115, 22, 0.18)",
  "Biaya Bank": "rgba(234, 179, 8, 0.2)",
  "Transfer Keluar": "rgba(99, 102, 241, 0.18)"
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

export function DashboardReportTable({
  monthColumns,
  rows,
  categorySubtotals,
  monthGrandTotals,
  title = "Dashboard Report",
  description
}: Props) {
  const categoryOrder = Array.from(new Set(rows.map((row) => row.categoryId)));

  return (
    <section className="card">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
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
            {categoryOrder.map((categoryId, categoryIndex) => {
              const categoryRows = rows.filter((row) => row.categoryId === categoryId);
              const categoryName = categoryRows[0]?.categoryName ?? "-";
              const rowBackgroundColor = CATEGORY_ROW_COLORS[categoryName];
              const totals = categorySubtotals[categoryId];
              const isLastCategory = categoryIndex === categoryOrder.length - 1;
              return (
                <Fragment key={categoryId}>
                  {categoryRows.map((row, index) => (
                        <tr
                          key={`${row.categoryId}:${row.subcategoryId}`}
                          className={`border-b border-[rgb(var(--border))] ${rowBackgroundColor ? "text-[rgb(var(--text))]" : ""}`}
                          style={rowBackgroundColor ? { backgroundColor: rowBackgroundColor } : undefined}
                        >
                          <td className="px-3 py-2 font-medium">
                            {index === 0 ? categoryName : ""}
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
                        className="border-b border-[rgb(var(--border))] text-[rgb(var(--text))]"
                        style={{ backgroundColor: "rgba(250, 204, 21, 0.28)" }}
                      >
                        <td className="px-3 py-2 font-semibold" colSpan={2}>
                          {categoryName} Subtotal
                        </td>
                        {monthColumns.map((monthKey) => (
                          <td key={monthKey} className="px-3 py-2 text-right font-semibold">
                            {formatCurrency(totals?.byMonth[monthKey] ?? 0)}
                          </td>
                        ))}
                      </tr>
                      {!isLastCategory ? (
                        <tr>
                          <td colSpan={monthColumns.length + 2} className="h-3 p-0" />
                        </tr>
                      ) : null}
                </Fragment>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={monthColumns.length + 2} className="px-3 py-6 text-center text-[rgb(var(--text-muted))]">
                  No data found for the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot style={{ backgroundColor: "rgb(var(--primary-strong))" }} className="text-white">
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
    </section>
  );
}
