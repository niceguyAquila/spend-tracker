"use client";

import { TableEmptyState } from "@/components/ui/table-empty-state";
import { formatAmount, getAmountColorClass } from "@/lib/display-format";
import { rowStripeClass } from "@/lib/ui/table";

type PivotRow = {
  categoryId: string;
  categoryName: string;
  byMonth: Record<string, number>;
  subtotal: number;
};

type Props = {
  monthColumns: string[];
  rows: PivotRow[];
  monthGrandTotals: Record<string, number>;
  title?: string;
  description?: string;
  currencyCode?: string;
  /** Optional net amounts per month rendered as a second footer row. */
  netRow?: Record<string, number>;
  netRowLabel?: string;
};

const CATEGORY_ROW_COLORS: Record<string, string> = {
  "Pengeluaran Tetap": "rgba(var(--primary), 0.14)",
  "Pengeluaran Variable": "rgba(249, 115, 22, 0.18)",
  "Biaya Bank": "rgba(234, 179, 8, 0.2)",
  "Transfer Keluar": "rgba(99, 102, 241, 0.18)"
};

function formatCurrency(value: number, currencyCode: string) {
  return `${currencyCode} ${formatAmount(value, {
    locale: "en-US",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  })}`;
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
  monthGrandTotals,
  title = "Dashboard Report",
  description,
  currencyCode = "IDR",
  netRow,
  netRowLabel = "Net"
}: Props) {
  const labelColSpan = 1;

  return (
    <section className="card">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>

      <div className="w-full overflow-x-auto">
        <table className="data-table min-w-[980px]">
          <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
            <tr>
              <th className="px-3 py-2">Category</th>
              {monthColumns.map((monthKey) => (
                <th key={monthKey} className="px-3 py-2 text-right">
                  {formatMonthLabel(monthKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rowBackgroundColor = CATEGORY_ROW_COLORS[row.categoryName];
              return (
                <tr
                  key={row.categoryId}
                  className={`border-b border-[rgb(var(--border))] ${
                    rowBackgroundColor ? "text-[rgb(var(--text))]" : rowStripeClass(index)
                  }`}
                  style={rowBackgroundColor ? { backgroundColor: rowBackgroundColor } : undefined}
                >
                  <td className="px-3 py-2 font-medium">{row.categoryName}</td>
                  {monthColumns.map((monthKey) => (
                    <td key={monthKey} className="px-3 py-2 text-right">
                      {formatCurrency(row.byMonth[monthKey] ?? 0, currencyCode)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {!rows.length ? (
              <TableEmptyState
                colSpan={monthColumns.length + labelColSpan}
                message="No data found for the current filters."
              />
            ) : null}
          </tbody>
          <tfoot style={{ backgroundColor: "rgb(var(--primary-strong))" }} className="text-white">
            <tr>
              <td className="px-3 py-2 font-semibold" colSpan={labelColSpan}>
                Grand Total
              </td>
              {monthColumns.map((monthKey) => (
                <td key={monthKey} className="px-3 py-2 text-right font-semibold">
                  {formatCurrency(monthGrandTotals[monthKey] ?? 0, currencyCode)}
                </td>
              ))}
            </tr>
            {netRow ? (
              <tr className="border-t border-white/20 bg-[rgb(var(--surface-muted))] text-[rgb(var(--text))]">
                <td className="px-3 py-2 font-semibold" colSpan={labelColSpan}>
                  {netRowLabel}
                </td>
                {monthColumns.map((monthKey) => {
                  const value = netRow[monthKey] ?? 0;
                  return (
                    <td
                      key={monthKey}
                      className={`px-3 py-2 text-right font-semibold ${getAmountColorClass(value)}`}
                    >
                      {formatCurrency(value, currencyCode)}
                    </td>
                  );
                })}
              </tr>
            ) : null}
          </tfoot>
        </table>
      </div>
    </section>
  );
}
