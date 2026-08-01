"use client";

import { memo } from "react";
import type { ExpenseWithNames } from "@/lib/types";
import { formatAmount, formatDateDisplay, getAmountColorClass } from "@/lib/display-format";

export type SpendingEntryRowProps = {
  row: ExpenseWithNames;
  stripeClass: string;
  actionMenuOpen: boolean;
  criticalPending: boolean;
  onToggleActionMenu: (rowId: string, triggerEl: HTMLButtonElement) => void;
};

function signedExpenseAmount(row: Pick<ExpenseWithNames, "amount" | "entry_direction">) {
  const amount = Math.abs(Number(row.amount));
  return row.entry_direction === "profit" ? amount : -amount;
}

function EmptyCell() {
  return <span className="text-xs text-muted">-</span>;
}

function SpendingEntryRowInner({
  row,
  stripeClass,
  actionMenuOpen,
  criticalPending,
  onToggleActionMenu
}: SpendingEntryRowProps) {
  const signedAmount = signedExpenseAmount(row);

  return (
    <tr className={`border-b border-[rgb(var(--border))] align-top ${stripeClass}`}>
      <td className="overflow-hidden break-words px-3 py-2">{formatDateDisplay(row.expense_date)}</td>
      <td className="overflow-hidden break-words px-3 py-2">
        {row.type_name ? row.type_name : <EmptyCell />}
      </td>
      <td className="overflow-hidden break-words px-3 py-2">{row.category_name}</td>
      <td className="overflow-hidden break-words px-3 py-2">
        {row.description ? row.description : <EmptyCell />}
      </td>
      <td className="overflow-hidden break-words px-3 py-2">
        {row.staff_name ? row.staff_name : <EmptyCell />}
      </td>
      <td className="overflow-hidden break-words px-3 py-2">{row.currency_code}</td>
      <td className="overflow-hidden px-3 py-2 text-right tabular-nums whitespace-nowrap">
        <span
          className={`inline-flex w-full items-baseline justify-between gap-2 ${getAmountColorClass(signedAmount)}`}
        >
          <span>{row.currency_code}</span>
          <span>
            {formatAmount(Math.abs(row.amount), {
              minimumFractionDigits: 2,
              maximumFractionDigits: 4
            })}
          </span>
        </span>
      </td>
      <td className="overflow-hidden break-words px-3 py-2">
        {row.remarks ? row.remarks : <EmptyCell />}
      </td>
      <td className="overflow-hidden px-3 py-2">
        <div className="relative">
          <button
            type="button"
            className="btn-secondary btn-sm"
            aria-label="Open actions menu"
            aria-expanded={actionMenuOpen}
            aria-haspopup="menu"
            onClick={(event) => onToggleActionMenu(row.id, event.currentTarget)}
            disabled={criticalPending}
          >
            Actions
          </button>
        </div>
      </td>
      <td aria-hidden="true" className="px-3 py-2" />
    </tr>
  );
}

export const SpendingEntryRow = memo(SpendingEntryRowInner);
