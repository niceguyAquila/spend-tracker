"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type {
  BigBookVendorActorOutstandingDebtRow,
  BigBookVendorActorOutstandingEntry
} from "@/lib/types";
import { formatAmount, formatDateDisplay } from "@/lib/display-format";
import { TableEmptyState } from "@/components/ui/table-empty-state";
import { rowStripeClass } from "@/lib/ui/table";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  BigBookBulkSettleEditModal,
  type BulkSettleCreditDraft,
  type BulkSettleCurrency,
  type BulkSettleEditDraft,
  type BulkSettleMode
} from "@/components/big-book-bulk-settle-edit-modal";
import {
  parentCheckState,
  type ParentCheckState
} from "@/lib/big-book/outstanding-parent-check-state";
import type { OutstandingDetailFilters } from "@/components/big-book-vendor-actor-outstanding-table";

const COLUMN_COUNT = 9;
const CURRENCY_ORDER = ["IDR", "MYR", "USDT", "TRX"] as const;
const DEBT_AMOUNT_CLASS = "text-[rgb(var(--danger))]";

type SortKey = "group_label" | "actor_display_name" | "currency" | "outstanding";

type Props = {
  rows: BigBookVendorActorOutstandingDebtRow[];
  detailFilters?: OutstandingDetailFilters;
  /** Called after a successful debt payment so the parent can refresh metrics/ledger. */
  onSettled?: () => void;
};

type DetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; rows: BigBookVendorActorOutstandingEntry[]; totalCount: number };

type PendingBulkPay = {
  debts: BulkSettleCreditDraft[];
  totalAmount: number;
  currency: string;
  label: string;
};

function compareRows(
  a: BigBookVendorActorOutstandingDebtRow,
  b: BigBookVendorActorOutstandingDebtRow,
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

  const currencyDiff = CURRENCY_ORDER.indexOf(a.currency) - CURRENCY_ORDER.indexOf(b.currency);
  if (currencyDiff !== 0) return currencyDiff;
  return b.outstanding - a.outstanding;
}

function detailCacheKey(row: BigBookVendorActorOutstandingDebtRow, filters?: OutstandingDetailFilters) {
  return `${row.row_key}:${filters?.dateFrom ?? ""}:${filters?.dateTo ?? ""}`;
}

function extractApiError(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function toDebtDrafts(entries: BigBookVendorActorOutstandingEntry[]): BulkSettleCreditDraft[] {
  return entries.map((entry) => ({
    id: entry.id,
    amount: entry.amount,
    currency_code: entry.currency_code as BulkSettleCurrency,
    explanation: entry.explanation,
    entry_date: entry.entry_date
  }));
}

export function BigBookVendorActorOutstandingDebtTable({
  rows,
  detailFilters,
  onSettled
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("currency");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [detailsByKey, setDetailsByKey] = useState<Record<string, DetailState>>({});
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const [selectedDebtIds, setSelectedDebtIds] = useState<Set<string>>(() => new Set());
  const [pendingPay, setPendingPay] = useState<PendingBulkPay | null>(null);
  const [payMode, setPayMode] = useState<BulkSettleMode>("single");
  const [editDraft, setEditDraft] = useState<BulkSettleEditDraft | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payMessage, setPayMessage] = useState<string | null>(null);
  const [rowPayLoadingKey, setRowPayLoadingKey] = useState<string | null>(null);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDir)),
    [rows, sortKey, sortDir]
  );

  const currencySubtotals = useMemo(() => {
    const map = new Map<
      BigBookVendorActorOutstandingDebtRow["currency"],
      { outstanding: number; openCount: number }
    >();
    for (const row of rows) {
      const existing = map.get(row.currency) ?? {
        outstanding: 0,
        openCount: 0
      };
      existing.outstanding += row.outstanding;
      existing.openCount += row.open_debt_count;
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

  const fetchDetailRows = useCallback(
    async (row: BigBookVendorActorOutstandingDebtRow): Promise<BigBookVendorActorOutstandingEntry[]> => {
      const cacheKey = detailCacheKey(row, detailFilters);
      const existing = detailsByKey[cacheKey];
      if (existing?.status === "ok") return existing.rows;

      const params = new URLSearchParams();
      params.set("actorId", row.actor_id);
      params.set("currency", row.currency);
      params.set("groupId", row.group_id ?? "none");
      if (row.entry_id) params.set("entryId", row.entry_id);
      if (detailFilters?.dateFrom) params.set("dateFrom", detailFilters.dateFrom);
      if (detailFilters?.dateTo) params.set("dateTo", detailFilters.dateTo);

      const response = await fetch(
        `/api/big-book/vendor-actor-outstanding-debt/entries?${params.toString()}`
      );
      if (handleUnauthorizedResponse(response)) return [];
      const data = await response.json();
      if (!response.ok) {
        const message =
          typeof data?.error === "string" ? data.error : "Failed to load open debts.";
        setDetailsByKey((prev) => ({ ...prev, [cacheKey]: { status: "error", message } }));
        throw new Error(message);
      }
      const nextRows: BigBookVendorActorOutstandingEntry[] = Array.isArray(data?.rows)
        ? data.rows
        : [];
      const totalCount = typeof data?.totalCount === "number" ? data.totalCount : nextRows.length;
      setDetailsByKey((prev) => ({
        ...prev,
        [cacheKey]: { status: "ok", rows: nextRows, totalCount }
      }));
      return nextRows;
    },
    [detailFilters, detailsByKey]
  );

  const loadDetails = useCallback(
    async (row: BigBookVendorActorOutstandingDebtRow) => {
      try {
        await fetchDetailRows(row);
      } catch {
        // fetchDetailRows already stores the error state.
      }
    },
    [fetchDetailRows]
  );

  function toggleExpanded(row: BigBookVendorActorOutstandingDebtRow) {
    const cacheKey = detailCacheKey(row, detailFilters);
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(cacheKey)) {
        next.delete(cacheKey);
        return next;
      }
      next.add(cacheKey);
      return next;
    });
    setDetailsByKey((prev) => {
      if (prev[cacheKey]) return prev;
      void loadDetails(row);
      return { ...prev, [cacheKey]: { status: "loading" } };
    });
  }

  const syncParentSelectionFromDebts = useCallback(
    (row: BigBookVendorActorOutstandingDebtRow, nextDebtIds: Set<string>) => {
      const cacheKey = detailCacheKey(row, detailFilters);
      const details = detailsByKey[cacheKey];
      if (details?.status !== "ok" || !details.rows.length) return;
      const allSelected = details.rows.every((entry) => nextDebtIds.has(entry.id));
      setSelectedRowKeys((prev) => {
        const has = prev.has(row.row_key);
        if (allSelected === has) return prev;
        const next = new Set(prev);
        if (allSelected) next.add(row.row_key);
        else next.delete(row.row_key);
        return next;
      });
    },
    [detailFilters, detailsByKey]
  );

  async function toggleRowSelected(row: BigBookVendorActorOutstandingDebtRow) {
    const cacheKey = detailCacheKey(row, detailFilters);
    const currentlySelected = selectedRowKeys.has(row.row_key);
    const details = detailsByKey[cacheKey];

    if (currentlySelected) {
      setSelectedRowKeys((prev) => {
        const next = new Set(prev);
        next.delete(row.row_key);
        return next;
      });
      if (details?.status === "ok") {
        setSelectedDebtIds((prev) => {
          const next = new Set(prev);
          for (const entry of details.rows) next.delete(entry.id);
          return next;
        });
      }
      return;
    }

    setSelectedRowKeys((prev) => new Set(prev).add(row.row_key));
    try {
      const detailRows = details?.status === "ok" ? details.rows : await fetchDetailRows(row);
      setSelectedDebtIds((prev) => {
        const next = new Set(prev);
        for (const entry of detailRows) next.add(entry.id);
        return next;
      });
      if (!expandedKeys.has(cacheKey)) {
        setExpandedKeys((prev) => new Set(prev).add(cacheKey));
      }
    } catch {
      setSelectedRowKeys((prev) => {
        const next = new Set(prev);
        next.delete(row.row_key);
        return next;
      });
    }
  }

  function toggleDebtSelected(row: BigBookVendorActorOutstandingDebtRow, debtId: string) {
    setSelectedDebtIds((prev) => {
      const next = new Set(prev);
      if (next.has(debtId)) next.delete(debtId);
      else next.add(debtId);
      syncParentSelectionFromDebts(row, next);
      return next;
    });
  }

  function parentStateForRow(row: BigBookVendorActorOutstandingDebtRow): ParentCheckState {
    const cacheKey = detailCacheKey(row, detailFilters);
    const details = detailsByKey[cacheKey];
    const detailIds =
      details?.status === "ok" ? details.rows.map((entry) => entry.id) : null;
    return parentCheckState(detailIds, selectedDebtIds, selectedRowKeys.has(row.row_key));
  }

  async function preparePayFromRow(row: BigBookVendorActorOutstandingDebtRow) {
    setPayError(null);
    setPayMessage(null);
    setRowPayLoadingKey(row.row_key);
    try {
      const detailRows = await fetchDetailRows(row);
      if (!detailRows.length) {
        setPayError("No open debts found for this group row.");
        return;
      }
      const debts = toDebtDrafts(detailRows);
      setPayMode("single");
      setEditDraft(null);
      setPendingPay({
        debts,
        totalAmount: debts.reduce((sum, item) => sum + item.amount, 0),
        currency: row.currency,
        label: `${row.group_label} · ${row.actor_display_name} · ${row.currency}`
      });
    } catch (error) {
      setPayError(error instanceof Error ? error.message : "Failed to prepare payment.");
    } finally {
      setRowPayLoadingKey(null);
    }
  }

  async function preparePayFromSelection() {
    setPayError(null);
    setPayMessage(null);
    try {
      const debtIdSet = new Set(selectedDebtIds);
      const debtsById = new Map<string, BulkSettleCreditDraft>();

      for (const row of rows) {
        const cacheKey = detailCacheKey(row, detailFilters);
        const details = detailsByKey[cacheKey];
        if (details?.status !== "ok") continue;
        for (const entry of details.rows) {
          if (debtIdSet.has(entry.id)) {
            debtsById.set(entry.id, toDebtDrafts([entry])[0]);
          }
        }
      }

      const selectedRows = rows.filter((row) => selectedRowKeys.has(row.row_key));
      for (const row of selectedRows) {
        const detailRows = await fetchDetailRows(row);
        for (const entry of detailRows) {
          debtIdSet.add(entry.id);
          debtsById.set(entry.id, toDebtDrafts([entry])[0]);
        }
      }

      const missing = [...debtIdSet].filter((id) => !debtsById.has(id));
      if (missing.length) {
        setPayError(
          "Expand the group rows for selected debts (or select the group row) so amounts can be confirmed."
        );
        return;
      }

      const debts = [...debtIdSet]
        .map((id) => debtsById.get(id))
        .filter((row): row is BulkSettleCreditDraft => Boolean(row));
      if (!debts.length) {
        setPayError("Select at least one group row or open debt to pay.");
        return;
      }

      const currencies = new Set(debts.map((row) => row.currency_code));
      const totalAmount = debts.reduce((sum, row) => sum + row.amount, 0);
      const currencyLabel =
        currencies.size === 1 ? [...currencies][0] : `${currencies.size} currencies`;

      setPayMode("single");
      setEditDraft(null);
      setPendingPay({
        debts,
        totalAmount,
        currency: currencyLabel,
        label: `${debts.length} selected open debt${debts.length === 1 ? "" : "s"}`
      });
    } catch (error) {
      setPayError(error instanceof Error ? error.message : "Failed to prepare payment.");
    }
  }

  function openEditDialogFromChooser() {
    if (!pendingPay) return;
    setPayError(null);
    setEditDraft({
      mode: payMode,
      credits: pendingPay.debts,
      label: pendingPay.label
    });
    setPendingPay(null);
  }

  async function submitBulkDebtPay(payload: {
    entry_date: string;
    currency_code: BulkSettleCurrency;
    amount: number;
    settlement_conversion_rate?: number;
    settlement_note: string;
    close_credits: boolean;
    explanation: string;
  }) {
    if (!editDraft) return;
    setPaySubmitting(true);
    setPayError(null);
    try {
      const body: Record<string, unknown> = {
        debt_entry_ids: editDraft.credits.map((row) => row.id),
        mode: editDraft.mode === "per_credit" ? "per_debt" : "single",
        entry_date: payload.entry_date,
        close_debts: payload.close_credits,
        currency_code: payload.currency_code
      };
      if (
        payload.settlement_conversion_rate != null &&
        Number.isFinite(payload.settlement_conversion_rate) &&
        payload.settlement_conversion_rate > 0
      ) {
        body.settlement_conversion_rate = payload.settlement_conversion_rate;
      }
      if (payload.settlement_note) body.settlement_note = payload.settlement_note;
      if (payload.explanation) body.explanation = payload.explanation;
      if (editDraft.mode === "single") body.amount = payload.amount;

      const response = await secureFetch("/api/big-book/entries/bulk-debt-settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setPayError(extractApiError(data.error, "Failed to record debt payment."));
        return;
      }
      setPayMessage(
        editDraft.mode === "single"
          ? `Created 1 Out payment covering ${editDraft.credits.length} debt(s).`
          : `Created ${editDraft.credits.length} debt payment record(s).`
      );
      setEditDraft(null);
      setSelectedRowKeys(new Set());
      setSelectedDebtIds(new Set());
      setDetailsByKey({});
      setExpandedKeys(new Set());
      onSettled?.();
    } catch {
      setPayError("Failed to record debt payment due to a network error.");
    } finally {
      setPaySubmitting(false);
    }
  }

  const selectedCount = useMemo(() => {
    if (selectedDebtIds.size > 0) return selectedDebtIds.size;
    let pending = 0;
    for (const row of rows) {
      if (!selectedRowKeys.has(row.row_key)) continue;
      const cacheKey = detailCacheKey(row, detailFilters);
      const details = detailsByKey[cacheKey];
      if (details?.status === "ok") continue;
      pending += row.open_debt_count;
    }
    return pending;
  }, [selectedDebtIds, selectedRowKeys, rows, detailFilters, detailsByKey]);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn"
          disabled={selectedCount === 0 || paySubmitting}
          onClick={() => void preparePayFromSelection()}
        >
          Record payment{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
        {payMessage ? <p className="text-sm text-[rgb(var(--success))]">{payMessage}</p> : null}
        {payError ? <p className="text-sm text-[rgb(var(--danger))]">{payError}</p> : null}
      </div>

      <div className="overflow-x-auto">
        <table className="data-table min-w-[960px]">
          <thead>
            <tr>
              <th className="w-10 px-3 py-2" aria-label="Select" />
              <th className="w-10 px-3 py-2" aria-label="Expand" />
              <th className="px-3 py-2">Vendor Type</th>
              <th className="px-3 py-2">
                <button type="button" className="font-semibold" onClick={() => toggleSort("group_label")}>
                  {sortLabel("Grouped transaction", "group_label")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button
                  type="button"
                  className="font-semibold"
                  onClick={() => toggleSort("actor_display_name")}
                >
                  {sortLabel("Actor (owes)", "actor_display_name")}
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
              <th className="px-3 py-2">Open Debts</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, index) => {
              const cacheKey = detailCacheKey(row, detailFilters);
              const expanded = expandedKeys.has(cacheKey);
              const details = detailsByKey[cacheKey];
              return (
                <DebtSummaryRows
                  key={row.row_key}
                  row={row}
                  index={index}
                  expanded={expanded}
                  details={details}
                  parentState={parentStateForRow(row)}
                  selectedDebtIds={selectedDebtIds}
                  payLoading={rowPayLoadingKey === row.row_key}
                  onToggleExpand={() => toggleExpanded(row)}
                  onToggleSelected={() => void toggleRowSelected(row)}
                  onToggleDebt={(debtId) => toggleDebtSelected(row, debtId)}
                  onPay={() => void preparePayFromRow(row)}
                />
              );
            })}
            {!rows.length ? (
              <TableEmptyState colSpan={COLUMN_COUNT} message="No open debts right now." />
            ) : null}
          </tbody>
          {currencySubtotals.length ? (
            <tfoot className="border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]">
              {currencySubtotals.map((subtotal) => (
                <tr key={subtotal.currency}>
                  <td className="px-3 py-2" aria-hidden="true" colSpan={2} />
                  <td className="px-3 py-2 font-medium" colSpan={3}>
                    Subtotal
                  </td>
                  <td className="px-3 py-2 font-medium">{subtotal.currency}</td>
                  <td className={`px-3 py-2 font-medium ${DEBT_AMOUNT_CLASS}`}>
                    {formatAmount(subtotal.outstanding, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 4
                    })}
                  </td>
                  <td className="px-3 py-2 font-medium">{subtotal.openCount}</td>
                  <td className="px-3 py-2" aria-hidden="true" />
                </tr>
              ))}
            </tfoot>
          ) : null}
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(pendingPay)}
        onOpenChange={(open) => {
          if (!open) setPendingPay(null);
        }}
        title="Record debt payment?"
        description={
          pendingPay ? (
            <div className="space-y-3 text-sm">
              <p>
                Prepare payment for {pendingPay.debts.length} open debt(s) totaling{" "}
                {formatAmount(pendingPay.totalAmount, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 4
                })}{" "}
                {pendingPay.currency}.
              </p>
              {pendingPay.debts.length > 1 ? (
                <div className="space-y-2">
                  <p className="font-medium">Payment mode</p>
                  <label className="flex items-start gap-2">
                    <input
                      className="mt-1"
                      type="radio"
                      name="debt-pay-mode"
                      checked={payMode === "single"}
                      onChange={() => setPayMode("single")}
                    />
                    <span>One Out payment covering all selected debts</span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      className="mt-1"
                      type="radio"
                      name="debt-pay-mode"
                      checked={payMode === "per_credit"}
                      onChange={() => setPayMode("per_credit")}
                    />
                    <span>One Out payment per debt</span>
                  </label>
                </div>
              ) : null}
            </div>
          ) : (
            "Prepare debt payment."
          )
        }
        confirmLabel="Continue"
        onConfirm={openEditDialogFromChooser}
      />

      <BigBookBulkSettleEditModal
        draft={editDraft}
        open={Boolean(editDraft)}
        submitting={paySubmitting}
        error={payError}
        variant="debt"
        onOpenChange={(open) => {
          if (!open && !paySubmitting) setEditDraft(null);
        }}
        onSubmit={(payload) => void submitBulkDebtPay(payload)}
      />
    </div>
  );
}

function DebtSummaryRows({
  row,
  index,
  expanded,
  details,
  parentState,
  selectedDebtIds,
  payLoading,
  onToggleExpand,
  onToggleSelected,
  onToggleDebt,
  onPay
}: {
  row: BigBookVendorActorOutstandingDebtRow;
  index: number;
  expanded: boolean;
  details: DetailState | undefined;
  parentState: ParentCheckState;
  selectedDebtIds: Set<string>;
  payLoading: boolean;
  onToggleExpand: () => void;
  onToggleSelected: () => void;
  onToggleDebt: (debtId: string) => void;
  onPay: () => void;
}) {
  return (
    <>
      <tr className={`border-b border-[rgb(var(--border))] ${rowStripeClass(index)}`}>
        <td className="px-3 py-2">
          <input
            type="checkbox"
            checked={parentState === "checked"}
            ref={(el) => {
              if (el) el.indeterminate = parentState === "indeterminate";
            }}
            aria-label={`Select open debts for ${row.group_label}`}
            onChange={onToggleSelected}
          />
        </td>
        <td className="px-3 py-2">
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-xs"
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Collapse open debts for ${row.group_label}`
                : `Expand open debts for ${row.group_label}`
            }
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand();
            }}
          >
            {expanded ? "▾" : "▸"}
          </button>
        </td>
        <td className="px-3 py-2">{row.vendor_type_name}</td>
        <td className="px-3 py-2">{row.group_label}</td>
        <td className="px-3 py-2">{row.actor_display_name}</td>
        <td className="px-3 py-2">{row.currency}</td>
        <td className={`px-3 py-2 font-medium ${DEBT_AMOUNT_CLASS}`}>
          {formatAmount(row.outstanding, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4
          })}
        </td>
        <td className="px-3 py-2">{row.open_debt_count}</td>
        <td className="px-3 py-2">
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={payLoading}
            onClick={(event) => {
              event.stopPropagation();
              onPay();
            }}
          >
            {payLoading ? "Loading…" : "Record payment"}
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/50">
          <td className="px-3 py-3" colSpan={COLUMN_COUNT}>
            <DebtNestedTable
              details={details}
              selectedDebtIds={selectedDebtIds}
              onToggleDebt={onToggleDebt}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function DebtNestedTable({
  details,
  selectedDebtIds,
  onToggleDebt
}: {
  details: DetailState | undefined;
  selectedDebtIds: Set<string>;
  onToggleDebt: (debtId: string) => void;
}) {
  if (!details || details.status === "loading") {
    return <p className="text-sm text-muted">Loading open debts…</p>;
  }
  if (details.status === "error") {
    return <p className="text-sm text-[rgb(var(--danger))]">{details.message}</p>;
  }
  if (!details.rows.length) {
    return <p className="text-sm text-muted">No open debts for this grouped transaction and actor.</p>;
  }

  const truncated = details.totalCount > details.rows.length;

  return (
    <div className="space-y-2">
      {truncated ? (
        <p className="text-xs text-muted">
          Showing first {details.rows.length} of {details.totalCount} open debts.
        </p>
      ) : null}
      <table className="data-table min-w-full">
        <thead className="text-xs text-muted">
          <tr>
            <th className="w-8 px-3 py-1.5 font-medium" aria-label="Select debt" />
            <th className="px-3 py-1.5 font-medium">Date</th>
            <th className="px-3 py-1.5 font-medium">In/Out</th>
            <th className="px-3 py-1.5 font-medium">Type</th>
            <th className="px-3 py-1.5 font-medium">Explanation</th>
            <th className="px-3 py-1.5 font-medium">Amount</th>
            <th className="px-3 py-1.5 font-medium">Remark</th>
            <th className="px-3 py-1.5 font-medium">Ledger</th>
          </tr>
        </thead>
        <tbody>
          {details.rows.map((entry) => (
            <tr key={entry.id} className="border-b border-[rgb(var(--border))] align-top">
              <td className="px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={selectedDebtIds.has(entry.id)}
                  aria-label={`Select debt ${entry.explanation}`}
                  onChange={() => onToggleDebt(entry.id)}
                />
              </td>
              <td className="px-3 py-1.5">{formatDateDisplay(entry.entry_date)}</td>
              <td className="px-3 py-1.5">
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
              <td className="px-3 py-1.5">{entry.type_name}</td>
              <td className="px-3 py-1.5">{entry.explanation}</td>
              <td className={`px-3 py-1.5 font-medium tabular-nums ${DEBT_AMOUNT_CLASS}`}>
                {entry.currency_code}{" "}
                {formatAmount(entry.amount, {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 4
                })}
              </td>
              <td className="px-3 py-1.5">
                {entry.remark ? entry.remark : <span className="text-xs text-muted">-</span>}
              </td>
              <td className="px-3 py-1.5">
                <Link
                  href={`/dashboard/big-book?entryId=${entry.id}#ledger-records`}
                  className="text-xs text-[rgb(var(--info))] underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  View in ledger
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
