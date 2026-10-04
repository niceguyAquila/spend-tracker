"use client";

import { memo, useMemo, type RefObject, type ReactNode } from "react";
import type { BigBookEntry, BigBookEntryGroup } from "@/lib/types";
import { formatAmount, formatDateDisplay, getAmountColorClass } from "@/lib/display-format";
import { summarizeCurrencies } from "@/lib/big-book/totals";
import {
  classifyLedgerGroupTone,
  ledgerGroupToneClass
} from "@/lib/big-book/ledger-group-tone";

const NET_AMOUNT_FORMAT = { minimumFractionDigits: 2, maximumFractionDigits: 4 } as const;

type Props = {
  group: BigBookEntryGroup;
  entries: BigBookEntry[];
  expanded: boolean;
  onToggle: () => void;
  /** Columns between the amount column and the actions column. */
  trailingColSpan: number;
  /** Full ledger column count for spacer rows. */
  columnCount: number;
  openActionMenu: { id: string; top: number; left: number } | null;
  actionMenuRef: RefObject<HTMLDivElement | null>;
  onOpenActionMenu: (id: string, top: number, left: number) => void;
  onCloseActionMenu: () => void;
  onEdit: () => void;
  onUngroup: () => void;
  onDelete: () => void;
  children: ReactNode;
};

function BigBookGroupHeaderRowInner({
  group,
  entries,
  expanded,
  onToggle,
  trailingColSpan,
  columnCount,
  openActionMenu,
  actionMenuRef,
  onOpenActionMenu,
  onCloseActionMenu,
  onEdit,
  onUngroup,
  onDelete,
  children
}: Props) {
  const { dateLabel, totals, toneClass } = useMemo(() => {
    const dates = entries.map((entry) => entry.entry_date).sort();
    const dateFrom = dates[0];
    const dateTo = dates[dates.length - 1];
    return {
      dateLabel:
        dateFrom === dateTo
          ? formatDateDisplay(dateFrom)
          : `${formatDateDisplay(dateFrom)} – ${formatDateDisplay(dateTo)}`,
      totals: summarizeCurrencies(entries),
      toneClass: ledgerGroupToneClass(classifyLedgerGroupTone(entries))
    };
  }, [entries]);

  const menuId = `group:${group.id}`;
  const menuOpen = openActionMenu?.id === menuId;
  const itemCount = entries.length;

  return (
    <>
      <tr className="group-block-spacer" aria-hidden="true">
        <td colSpan={columnCount} />
      </tr>
      <tr
        className={`group-header border-b border-[rgb(var(--border))] align-top${
          toneClass ? ` ${toneClass}` : ""
        }`}
      >
        <td className="px-3 py-2">
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-xs"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse group" : "Expand group"}
            onClick={onToggle}
          >
            <span
              className={`group-chevron${expanded ? " group-chevron--expanded" : ""}`}
              aria-hidden="true"
            >
              ▸
            </span>
          </button>
        </td>
        <td className="overflow-hidden break-words px-3 py-2">{dateLabel}</td>
        <td className="px-3 py-2">
          <span className="text-xs text-muted">-</span>
        </td>
        <td className="px-3 py-2">
          <span className="text-xs text-muted">-</span>
        </td>
        <td className="px-3 py-2">
          <span className="text-xs text-muted">-</span>
        </td>
        <td className="px-3 py-2">
          <span className="text-xs text-muted">-</span>
        </td>
        <td className="px-3 py-2">
          <div className="min-w-0">
            <p className="font-medium text-[rgb(var(--text))]">{group.label}</p>
            <p className="text-xs text-muted">Group</p>
            {group.remark ? <p className="mt-1 truncate text-xs text-muted">{group.remark}</p> : null}
          </div>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {totals.length ? (
            <div className="flex flex-col items-stretch gap-1">
              {totals.map((total) => (
                <div
                  key={total.currency}
                  className={`flex min-w-0 items-baseline justify-between gap-2 ${getAmountColorClass(
                    total.net
                  )}`}
                >
                  <span className="shrink-0 text-xs">{total.currency}</span>
                  <span className="min-w-0 break-all">{formatAmount(total.net, NET_AMOUNT_FORMAT)}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted">-</span>
          )}
        </td>
        <td className="px-3 py-2" colSpan={Math.max(1, trailingColSpan)} aria-hidden="true" />
        <td className="px-3 py-2">
          <div className="flex flex-col items-end gap-1.5">
            {itemCount > 0 ? (
              <span className="group-item-chip">
                {itemCount} item{itemCount === 1 ? "" : "s"}
              </span>
            ) : null}
            <div className="relative">
              <button
                className="btn-secondary btn-sm"
                aria-label="Open group actions menu"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  if (menuOpen) {
                    onCloseActionMenu();
                    return;
                  }
                  onOpenActionMenu(menuId, rect.bottom + 4, rect.right - 176);
                }}
              >
                Actions
              </button>
              {menuOpen && openActionMenu ? (
                <div
                  ref={actionMenuRef}
                  role="menu"
                  className="fixed z-50 w-44 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1 shadow-lg"
                  style={{ top: openActionMenu.top, left: openActionMenu.left }}
                >
                  <button
                    role="menuitem"
                    className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-[rgb(var(--surface-muted))]"
                    onClick={() => {
                      onCloseActionMenu();
                      onEdit();
                    }}
                  >
                    Edit group
                  </button>
                  <button
                    role="menuitem"
                    className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-[rgb(var(--surface-muted))]"
                    onClick={() => {
                      onCloseActionMenu();
                      onUngroup();
                    }}
                  >
                    Ungroup
                  </button>
                  <button
                    role="menuitem"
                    className="block w-full rounded px-3 py-2 text-left text-sm text-[rgb(var(--danger))] hover:bg-[rgb(var(--danger)/0.12)]"
                    onClick={() => {
                      onCloseActionMenu();
                      onDelete();
                    }}
                  >
                    Delete group
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </td>
      </tr>
      {expanded ? children : null}
      <tr className="group-block-spacer" aria-hidden="true">
        <td colSpan={columnCount} />
      </tr>
    </>
  );
}

export const BigBookGroupHeaderRow = memo(BigBookGroupHeaderRowInner);
