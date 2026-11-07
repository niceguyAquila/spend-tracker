import { formatAmount, formatDateDisplay } from "@/lib/display-format";
import type { BigBookEntry } from "@/lib/types";

/** One undoable settlement: by request id, or by payment id for legacy payments. */
export type SettlementUndoCandidate = {
  key: string;
  label: string;
  ref: { request_id: string } | { payment_id: string };
};

/** Settlements an entry (payment) or group of entries can undo, newest first. */
export function settlementUndoCandidates(entries: readonly BigBookEntry[]): SettlementUndoCandidate[] {
  const byKey = new Map<string, SettlementUndoCandidate & { sortKey: string }>();
  for (const entry of entries) {
    if (!entry.settles.length) continue;
    const key = entry.settlement_request_id ? `req:${entry.settlement_request_id}` : `pay:${entry.id}`;
    const targets = entry.settles.map((target) => target.explanation).filter(Boolean).join(", ");
    const amount = `${formatAmount(Math.abs(Number(entry.amount)))} ${entry.currency_code}`;
    const label = `${formatDateDisplay(entry.entry_date)} · ${amount}${targets ? ` · ${targets}` : ""}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.label = `${existing.label} (+ more payments)`;
      continue;
    }
    byKey.set(key, {
      key,
      label,
      sortKey: `${entry.entry_date}|${entry.created_at}`,
      ref: entry.settlement_request_id ? { request_id: entry.settlement_request_id } : { payment_id: entry.id }
    });
  }
  return [...byKey.values()]
    .sort((left, right) => right.sortKey.localeCompare(left.sortKey))
    .map(({ sortKey: _sortKey, ...candidate }) => candidate);
}
