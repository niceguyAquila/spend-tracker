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

export function DashboardReportTable({
  monthColumns,
  rows,
  categorySubtotals,
  monthGrandTotals
}: Props) {
  const categoryOrder = Array.from(new Set(rows.map((row) => row.categoryId)));

  return (
    <section className="card">
      <div className="mb-3">
        <h2 className="text-lg font-semibold">Dashboard Report</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50 text-left">
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
                      className="border-b"
                      style={rowBackgroundColor ? { backgroundColor: rowBackgroundColor } : undefined}
                    >
                      <td className="px-3 py-2 font-medium">{index === 0 ? categoryName : ""}</td>
                      <td className="px-3 py-2">{row.subcategoryName}</td>
                      {monthColumns.map((monthKey) => (
                        <td key={monthKey} className="px-3 py-2 text-right">
                          {formatCurrency(row.byMonth[monthKey] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-b" style={{ backgroundColor: "#ffe699" }}>
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
    </section>
  );
}
