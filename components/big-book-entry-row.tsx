"use client";

import { memo } from "react";
import type { BigBookCreditStatus, BigBookEntry } from "@/lib/types";
import { formatAmount, formatDateDisplay, getAmountColorClass } from "@/lib/display-format";

const CREDIT_STATUS_LABELS: Record<BigBookCreditStatus, string> = {
  open: "Open",
  settled: "Settled"
};

function creditStatusBadgeClass(status: BigBookCreditStatus) {
  if (status === "settled") return "bg-[rgb(var(--success)/0.15)] text-[rgb(var(--success))]";
  return "bg-[rgb(var(--warning)/0.15)] text-[rgb(var(--warning))]";
}

function truncateText(value: string, maxLength = 28) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

export type BigBookEntryRowProps = {
  entry: BigBookEntry;
  isGroupMember: boolean;
  stripeClass: string;
  highlighted?: boolean;
  selected: boolean;
  actionMenuOpen: boolean;
  criticalPending: boolean;
  attachmentViewingId: string | null;
  onToggleSelected: (entryId: string) => void;
  onViewRemark: (entryId: string, text: string) => void;
  onViewAttachment: (attachmentId: string) => void;
  onToggleActionMenu: (entryId: string, triggerEl: HTMLButtonElement) => void;
};

function BigBookEntryRowInner({
  entry,
  isGroupMember,
  stripeClass,
  highlighted = false,
  selected,
  actionMenuOpen,
  criticalPending,
  attachmentViewingId,
  onToggleSelected,
  onViewRemark,
  onViewAttachment,
  onToggleActionMenu
}: BigBookEntryRowProps) {
  return (
    <tr
      className={`border-b border-[rgb(var(--border))] align-top ${stripeClass}${
        highlighted ? " bg-[rgb(var(--info)/0.12)] ring-1 ring-inset ring-[rgb(var(--info))]" : ""
      }`}
    >
      <td className="overflow-hidden px-3 py-2">
        {isGroupMember ? null : (
          <input
            type="checkbox"
            className="h-4 w-4"
            aria-label={`Select transaction ${entry.explanation}`}
            checked={selected}
            onChange={() => onToggleSelected(entry.id)}
          />
        )}
      </td>
      <td className={`overflow-hidden break-words px-3 py-2 ${isGroupMember ? "pl-8" : ""}`}>
        {formatDateDisplay(entry.entry_date)}
      </td>
      <td className="overflow-hidden px-3 py-2">
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
      <td className="overflow-hidden break-words px-3 py-2">{entry.type_name}</td>
      <td className="overflow-hidden break-words px-3 py-2">
        {entry.sub_type_name ? entry.sub_type_name : <span className="text-xs text-muted">-</span>}
      </td>
      <td className="overflow-hidden break-words px-3 py-2">
        {entry.vendor_type_name ? entry.vendor_type_name : <span className="text-xs text-muted">-</span>}
      </td>
      <td className="overflow-hidden break-words px-3 py-2">
        {entry.vendor_name ? entry.vendor_name : <span className="text-xs text-muted">-</span>}
      </td>
      <td className="overflow-hidden break-words px-3 py-2">{entry.actor_display_name}</td>
      <td className="overflow-hidden break-words px-3 py-2">
        {entry.action_by_name ? entry.action_by_name : <span className="text-xs text-muted">-</span>}
      </td>
      <td className="overflow-hidden break-words px-3 py-2">{entry.explanation}</td>
      <td className="overflow-hidden px-3 py-2 text-right tabular-nums whitespace-nowrap">
        <span
          className={`inline-flex w-full items-baseline justify-between gap-2 ${getAmountColorClass(
            entry.entry_direction === "spending" ? -entry.amount : entry.amount
          )}`}
        >
          <span>{entry.currency_code}</span>
          <span>
            {formatAmount(entry.amount, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </span>
        </span>
      </td>
      <td className="overflow-hidden break-words px-3 py-2">
        {entry.is_credit ? (
          <div className="space-y-1">
            <span
              className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${creditStatusBadgeClass(
                entry.credit_status ?? "open"
              )}`}
            >
              {CREDIT_STATUS_LABELS[entry.credit_status ?? "open"]}
            </span>
            {entry.credit_settled_at ? (
              <p className="text-xs text-muted">
                Closed {formatDateDisplay(entry.credit_settled_at.slice(0, 10))}
              </p>
            ) : null}
          </div>
        ) : entry.settles_entry_id ? (
          <span className="inline-flex rounded bg-[rgb(var(--info)/0.15)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--info))]">
            Settles:{" "}
            {truncateText(
              entry.settles_entry?.explanation ||
                (entry.settles_entry ? formatDateDisplay(entry.settles_entry.entry_date) : "credit")
            )}
          </span>
        ) : (
          <span className="text-xs text-muted">-</span>
        )}
      </td>
      <td className="overflow-hidden break-words px-3 py-2">
        {entry.pocket_name ? entry.pocket_name : <span className="text-xs text-muted">-</span>}
      </td>
      <td className="overflow-hidden break-words px-3 py-2">
        {entry.remark ? (
          <div className="flex items-start gap-2">
            <span className="truncate">{entry.remark}</span>
            <button
              className="shrink-0 text-xs text-[rgb(var(--info))] underline"
              type="button"
              onClick={() => onViewRemark(entry.id, entry.remark ?? "")}
            >
              View
            </button>
          </div>
        ) : (
          "-"
        )}
      </td>
      <td className="overflow-hidden break-words px-3 py-2">
        {entry.attachments.length ? (
          <div className="space-y-1">
            <p className="text-xs text-muted">{entry.attachments.length} file(s)</p>
            <ul className="space-y-1">
              {entry.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <button
                    className="text-xs text-[rgb(var(--info))] underline"
                    onClick={() => onViewAttachment(attachment.id)}
                    disabled={attachmentViewingId === attachment.id}
                  >
                    {attachmentViewingId === attachment.id ? "Loading..." : attachment.file_name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <span className="text-xs text-muted">No files</span>
        )}
      </td>
      <td className="overflow-hidden px-3 py-2">
        <div className="relative">
          <button
            className="btn-secondary btn-sm"
            aria-label="Open actions menu"
            aria-expanded={actionMenuOpen}
            aria-haspopup="menu"
            onClick={(event) => onToggleActionMenu(entry.id, event.currentTarget)}
            disabled={criticalPending}
          >
            Actions
          </button>
        </div>
      </td>
    </tr>
  );
}

export const BigBookEntryRow = memo(BigBookEntryRowInner);
