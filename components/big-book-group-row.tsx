"use client";

import type { RefObject, ReactNode } from "react";
import type { BigBookEntry, BigBookEntryGroup } from "@/lib/types";
import { formatDateDisplay } from "@/lib/display-format";
import { summarizeCurrencies } from "@/lib/big-book/totals";
import { BigBookCurrencyTotals } from "@/components/big-book-currency-totals";

type Props = {
  group: BigBookEntryGroup;
  entries: BigBookEntry[];
  expanded: boolean;
  onToggle: () => void;
  colSpan: number;
  openActionMenu: { id: string; top: number; left: number } | null;
  actionMenuRef: RefObject<HTMLDivElement | null>;
  onOpenActionMenu: (id: string, top: number, left: number) => void;
  onCloseActionMenu: () => void;
  onEdit: () => void;
  onUngroup: () => void;
  onDelete: () => void;
  children: ReactNode;
};

export function BigBookGroupHeaderRow({
  group,
  entries,
  expanded,
  onToggle,
  colSpan,
  openActionMenu,
  actionMenuRef,
  onOpenActionMenu,
  onCloseActionMenu,
  onEdit,
  onUngroup,
  onDelete,
  children
}: Props) {
  const dates = entries.map((entry) => entry.entry_date).sort();
  const dateFrom = dates[0];
  const dateTo = dates[dates.length - 1];
  const dateLabel =
    dateFrom === dateTo
      ? formatDateDisplay(dateFrom)
      : `${formatDateDisplay(dateFrom)} – ${formatDateDisplay(dateTo)}`;
  const totals = summarizeCurrencies(entries);
  const menuId = `group:${group.id}`;
  const menuOpen = openActionMenu?.id === menuId;

  return (
    <>
      <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] align-top">
        <td className="px-3 py-2" aria-hidden="true" />
        <td className="px-3 py-2" colSpan={Math.max(1, colSpan - 4)}>
          <div className="flex items-start gap-2">
            <button
              type="button"
              className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-xs"
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse group" : "Expand group"}
              onClick={onToggle}
            >
              {expanded ? "▾" : "▸"}
            </button>
            <div className="min-w-0">
              <p className="font-medium text-[rgb(var(--text))]">{group.label}</p>
              <p className="text-xs text-muted">
                Group · {entries.length} transaction{entries.length === 1 ? "" : "s"} · {dateLabel}
              </p>
              {group.remark ? <p className="mt-1 truncate text-xs text-muted">{group.remark}</p> : null}
            </div>
          </div>
        </td>
        <td className="px-3 py-2" colSpan={2}>
          <BigBookCurrencyTotals totals={totals} showNet={false} />
        </td>
        <td className="px-3 py-2">
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
        </td>
      </tr>
      {expanded ? children : null}
    </>
  );
}
