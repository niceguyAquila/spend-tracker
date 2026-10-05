"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  BigBookVendorActorOutstandingEntry,
  BigBookVendorActorOutstandingRow
} from "@/lib/types";
import { formatAmount, formatDateDisplay, getAmountColorClass } from "@/lib/display-format";
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
  BigBookInvoiceBuilderModal,
  type InvoiceBuilderCreditDraft,
  type InvoiceBuilderSeed
} from "@/components/big-book-invoice-builder-modal";
import {
  parentCheckState,
  type ParentCheckState
} from "@/lib/big-book/outstanding-parent-check-state";

const CURRENCY_ORDER = ["IDR", "MYR", "USDT", "TRX"] as const;

type SortKey =
  | "vendor_type_name"
  | "type_name"
  | "actor_display_name"
  | "currency"
  | "outstanding";

function primaryGroupLabel(row: BigBookVendorActorOutstandingRow, isFutureKind: boolean) {
  return isFutureKind ? row.type_name : row.vendor_type_name;
}
export type OutstandingCreditKind = "credit" | "future";

export type OutstandingDetailFilters = {
  dateFrom?: string;
  dateTo?: string;
};

type Props = {
  rows: BigBookVendorActorOutstandingRow[];
  detailFilters?: OutstandingDetailFilters;
  /** Called after a successful bulk settle / actualize so the parent can refresh metrics/ledger. */
  onSettled?: () => void;
  /** Default `credit`. Use `future` for Future Credit outstanding (settle + actualize). */
  creditKind?: OutstandingCreditKind;
};

type PendingActualize = {
  credits: Array<{ id: string; expected_updated_at: string; explanation: string; amount: number }>;
  currency: string;
  label: string;
};

type DetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; rows: BigBookVendorActorOutstandingEntry[]; totalCount: number };

type PendingBulkSettle = {
  credits: BulkSettleCreditDraft[];
  totalAmount: number;
  currency: string;
  label: string;
};

function compareRows(
  a: BigBookVendorActorOutstandingRow,
  b: BigBookVendorActorOutstandingRow,
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
    const left = a[sortKey] ?? "";
    const right = b[sortKey] ?? "";
    if (left !== right) return left.localeCompare(right) * dir;
  }

  const currencyDiff = CURRENCY_ORDER.indexOf(a.currency) - CURRENCY_ORDER.indexOf(b.currency);
  if (currencyDiff !== 0) return currencyDiff;
  return b.outstanding - a.outstanding;
}

function detailCacheKey(
  row: BigBookVendorActorOutstandingRow,
  filters: OutstandingDetailFilters | undefined,
  creditKind: OutstandingCreditKind
) {
  return `${creditKind}:${row.row_key}:${filters?.dateFrom ?? ""}:${filters?.dateTo ?? ""}`;
}

function signedAmount(entry: BigBookVendorActorOutstandingEntry) {
  return entry.entry_direction === "spending" ? -entry.amount : entry.amount;
}

function extractApiError(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export function BigBookVendorActorOutstandingTable({
  rows,
  detailFilters,
  onSettled,
  creditKind = "credit"
}: Props) {
  const isFutureKind = creditKind === "future";
  const columnCount = 8;
  const primarySortKey: SortKey = isFutureKind ? "type_name" : "vendor_type_name";
  const [sortKey, setSortKey] = useState<SortKey>("currency");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [detailsByKey, setDetailsByKey] = useState<Record<string, DetailState>>({});
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const [selectedCreditIds, setSelectedCreditIds] = useState<Set<string>>(() => new Set());
  const [pendingSettle, setPendingSettle] = useState<PendingBulkSettle | null>(null);
  const [settleMode, setSettleMode] = useState<BulkSettleMode>("single");
  const [editDraft, setEditDraft] = useState<BulkSettleEditDraft | null>(null);
  const [settleSubmitting, setSettleSubmitting] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [settleMessage, setSettleMessage] = useState<string | null>(null);
  const [rowSettleLoadingKey, setRowSettleLoadingKey] = useState<string | null>(null);
  const [invoiceSeed, setInvoiceSeed] = useState<InvoiceBuilderSeed | null>(null);
  const [invoiceLoadingKey, setInvoiceLoadingKey] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [pendingActualize, setPendingActualize] = useState<PendingActualize | null>(null);
  const [actualizeSubmitting, setActualizeSubmitting] = useState(false);
  const [actualizeError, setActualizeError] = useState<string | null>(null);
  const [actualizeMessage, setActualizeMessage] = useState<string | null>(null);
  const [rowActualizeLoadingKey, setRowActualizeLoadingKey] = useState<string | null>(null);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDir)),
    [rows, sortKey, sortDir]
  );

  const currencySubtotals = useMemo(() => {
    const map = new Map<
      BigBookVendorActorOutstandingRow["currency"],
      { outstanding: number; openCount: number }
    >();
    for (const row of rows) {
      const existing = map.get(row.currency) ?? {
        outstanding: 0,
        openCount: 0
      };
      existing.outstanding += row.outstanding;
      existing.openCount += row.open_credit_count;
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
    async (row: BigBookVendorActorOutstandingRow): Promise<BigBookVendorActorOutstandingEntry[]> => {
      const cacheKey = detailCacheKey(row, detailFilters, creditKind);
      const existing = detailsByKey[cacheKey];
      if (existing?.status === "ok") return existing.rows;

      const params = new URLSearchParams();
      params.set("actorId", row.actor_id);
      params.set("currency", row.currency);
      params.set("creditKind", creditKind);
      if (isFutureKind) {
        params.set("typeId", row.entry_type_id ?? "none");
      } else {
        params.set("vendorTypeId", row.vendor_type_id ?? "none");
      }
      if (detailFilters?.dateFrom) params.set("dateFrom", detailFilters.dateFrom);
      if (detailFilters?.dateTo) params.set("dateTo", detailFilters.dateTo);

      const response = await fetch(
        `/api/big-book/vendor-actor-outstanding/entries?${params.toString()}`
      );
      if (handleUnauthorizedResponse(response)) return [];
      const data = await response.json();
      if (!response.ok) {
        const message =
          typeof data?.error === "string"
            ? data.error
            : isFutureKind
              ? "Failed to load Future Credits."
              : "Failed to load open credits.";
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
    [creditKind, detailFilters, detailsByKey, isFutureKind]
  );

  const loadDetails = useCallback(
    async (row: BigBookVendorActorOutstandingRow) => {
      const cacheKey = detailCacheKey(row, detailFilters, creditKind);
      try {
        await fetchDetailRows(row);
      } catch {
        // fetchDetailRows already stores the error state.
        void cacheKey;
      }
    },
    [detailFilters, fetchDetailRows]
  );

  function toggleExpanded(row: BigBookVendorActorOutstandingRow) {
    const cacheKey = detailCacheKey(row, detailFilters, creditKind);
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

  const syncParentSelectionFromCredits = useCallback(
    (row: BigBookVendorActorOutstandingRow, nextCreditIds: Set<string>) => {
      const cacheKey = detailCacheKey(row, detailFilters, creditKind);
      const details = detailsByKey[cacheKey];
      if (details?.status !== "ok" || !details.rows.length) return;
      const allSelected = details.rows.every((entry) => nextCreditIds.has(entry.id));
      setSelectedRowKeys((prev) => {
        const has = prev.has(row.row_key);
        if (allSelected === has) return prev;
        const next = new Set(prev);
        if (allSelected) next.add(row.row_key);
        else next.delete(row.row_key);
        return next;
      });
    },
    [creditKind, detailFilters, detailsByKey]
  );

  async function toggleRowSelected(row: BigBookVendorActorOutstandingRow) {
    const cacheKey = detailCacheKey(row, detailFilters, creditKind);
    const currentlySelected = selectedRowKeys.has(row.row_key);
    const details = detailsByKey[cacheKey];

    if (currentlySelected) {
      setSelectedRowKeys((prev) => {
        const next = new Set(prev);
        next.delete(row.row_key);
        return next;
      });
      const knownIds =
        details?.status === "ok"
          ? details.rows.map((entry) => entry.id)
          : null;
      if (knownIds) {
        setSelectedCreditIds((prev) => {
          const next = new Set(prev);
          for (const id of knownIds) next.delete(id);
          return next;
        });
        return;
      }
      try {
        const detailRows = await fetchDetailRows(row);
        setSelectedCreditIds((prev) => {
          const next = new Set(prev);
          for (const entry of detailRows) next.delete(entry.id);
          return next;
        });
      } catch {
        // Keep parent unchecked; children stay as-is if load failed.
      }
      return;
    }

    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      next.add(row.row_key);
      return next;
    });
    try {
      const detailRows = await fetchDetailRows(row);
      setSelectedCreditIds((prev) => {
        const next = new Set(prev);
        for (const entry of detailRows) next.add(entry.id);
        return next;
      });
    } catch {
      // Parent stays selected; settle/invoice flows still fetch on demand.
    }
  }

  function toggleCreditSelected(row: BigBookVendorActorOutstandingRow, creditId: string) {
    const nextCredits = new Set(selectedCreditIds);
    if (nextCredits.has(creditId)) nextCredits.delete(creditId);
    else nextCredits.add(creditId);
    setSelectedCreditIds(nextCredits);
    syncParentSelectionFromCredits(row, nextCredits);
  }

  function setCreditsSelected(
    row: BigBookVendorActorOutstandingRow,
    creditIds: string[],
    selected: boolean
  ) {
    const nextCredits = new Set(selectedCreditIds);
    for (const id of creditIds) {
      if (selected) nextCredits.add(id);
      else nextCredits.delete(id);
    }
    setSelectedCreditIds(nextCredits);
    syncParentSelectionFromCredits(row, nextCredits);
  }

  async function prepareSettleFromRow(row: BigBookVendorActorOutstandingRow) {
    setSettleError(null);
    setSettleMessage(null);
    setRowSettleLoadingKey(row.row_key);
    try {
      const detailRows = await fetchDetailRows(row);
      if (!detailRows.length) {
        setSettleError(
          isFutureKind
            ? "No open Future Credits found for this vendor row."
            : "No open credits found for this vendor row."
        );
        return;
      }
      const totalAmount = detailRows.reduce((sum, entry) => sum + entry.amount, 0);
      setSettleMode("single");
      setEditDraft(null);
      setPendingSettle({
        credits: detailRows.map((entry) => ({
          id: entry.id,
          amount: entry.amount,
          currency_code: entry.currency_code as BulkSettleCurrency,
          explanation: entry.explanation,
          entry_date: entry.entry_date
        })),
        totalAmount,
        currency: row.currency,
        label: isFutureKind
          ? `${row.type_name} · Actor ${row.actor_display_name}`
          : `${row.vendor_type_name} · Actor ${row.actor_display_name}`
      });
    } catch (error) {
      setSettleError(error instanceof Error ? error.message : "Failed to load credits to settle.");
    } finally {
      setRowSettleLoadingKey(null);
    }
  }

  async function prepareSettleFromSelection() {
    setSettleError(null);
    setSettleMessage(null);
    try {
      const creditIdSet = new Set(selectedCreditIds);
      const creditsById = new Map<string, BulkSettleCreditDraft>();

      // Collect credits already loaded from expanded detail.
      for (const details of Object.values(detailsByKey)) {
        if (details.status !== "ok") continue;
        for (const entry of details.rows) {
          if (creditIdSet.has(entry.id)) {
            creditsById.set(entry.id, {
              id: entry.id,
              amount: entry.amount,
              currency_code: entry.currency_code as BulkSettleCurrency,
              explanation: entry.explanation,
              entry_date: entry.entry_date
            });
          }
        }
      }

      // Resolve selected vendor rows into their open credits.
      const selectedRows = rows.filter((row) => selectedRowKeys.has(row.row_key));
      for (const row of selectedRows) {
        const detailRows = await fetchDetailRows(row);
        for (const entry of detailRows) {
          creditIdSet.add(entry.id);
          creditsById.set(entry.id, {
            id: entry.id,
            amount: entry.amount,
            currency_code: entry.currency_code as BulkSettleCurrency,
            explanation: entry.explanation,
            entry_date: entry.entry_date
          });
        }
      }

      // For credit-only selections that were not in loaded details, we still need
      // amounts — they should already be in creditsById if their parent was expanded.
      const missing = [...creditIdSet].filter((id) => !creditsById.has(id));
      if (missing.length) {
        setSettleError(
          "Expand the vendor rows for selected credits (or select the vendor row) so amounts can be confirmed."
        );
        return;
      }

      const credits = [...creditIdSet]
        .map((id) => creditsById.get(id))
        .filter((row): row is BulkSettleCreditDraft => Boolean(row));
      if (!credits.length) {
        setSettleError("Select at least one vendor row or open credit to settle.");
        return;
      }

      const currencies = new Set(credits.map((row) => row.currency_code));
      const totalAmount = credits.reduce((sum, row) => sum + row.amount, 0);
      const currencyLabel =
        currencies.size === 1 ? [...currencies][0] : `${currencies.size} currencies`;

      setSettleMode("single");
      setEditDraft(null);
      setPendingSettle({
        credits,
        totalAmount,
        currency: currencyLabel,
        label: `${credits.length} selected open credit${credits.length === 1 ? "" : "s"}`
      });
    } catch (error) {
      setSettleError(error instanceof Error ? error.message : "Failed to prepare settlement.");
    }
  }

  function toInvoiceCredits(
    entries: Array<{
      id: string;
      amount: number;
      currency_code: string;
      explanation: string;
      entry_date: string;
      remark?: string | null;
      entry_type_id?: string | null;
      type_name?: string;
    }>
  ): InvoiceBuilderCreditDraft[] {
    return entries.map((entry) => ({
      id: entry.id,
      amount: entry.amount,
      currency_code: entry.currency_code as InvoiceBuilderCreditDraft["currency_code"],
      explanation: entry.explanation,
      entry_date: entry.entry_date,
      remark: entry.remark ?? null,
      entry_type_id: entry.entry_type_id ?? null,
      type_name: entry.type_name
    }));
  }

  async function prepareInvoiceFromRow(row: BigBookVendorActorOutstandingRow) {
    setInvoiceError(null);
    setSettleError(null);
    setInvoiceLoadingKey(row.row_key);
    try {
      const detailRows = await fetchDetailRows(row);
      if (!detailRows.length) {
        setInvoiceError("No open credits found for this vendor row.");
        return;
      }
      setInvoiceSeed({
        vendor_name: isFutureKind ? row.type_name : row.vendor_type_name,
        actor_display_name: row.actor_display_name,
        currency: row.currency,
        credits: toInvoiceCredits(detailRows),
        label: isFutureKind
          ? `${row.type_name} · ${row.actor_display_name} · ${row.currency}`
          : `${row.vendor_type_name} · ${row.actor_display_name} · ${row.currency}`
      });
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : "Failed to load credits for invoice.");
    } finally {
      setInvoiceLoadingKey(null);
    }
  }

  async function prepareInvoiceFromSelection() {
    setInvoiceError(null);
    setSettleError(null);
    try {
      const creditIdSet = new Set(selectedCreditIds);
      const creditsById = new Map<string, InvoiceBuilderCreditDraft>();
      const rowByCreditId = new Map<string, BigBookVendorActorOutstandingRow>();

      for (const row of rows) {
        const cacheKey = detailCacheKey(row, detailFilters, creditKind);
        const details = detailsByKey[cacheKey];
        if (details?.status !== "ok") continue;
        for (const entry of details.rows) {
          if (creditIdSet.has(entry.id)) {
            creditsById.set(entry.id, toInvoiceCredits([entry])[0]);
            rowByCreditId.set(entry.id, row);
          }
        }
      }

      const selectedRows = rows.filter((row) => selectedRowKeys.has(row.row_key));
      for (const row of selectedRows) {
        const detailRows = await fetchDetailRows(row);
        for (const entry of detailRows) {
          creditIdSet.add(entry.id);
          creditsById.set(entry.id, toInvoiceCredits([entry])[0]);
          rowByCreditId.set(entry.id, row);
        }
      }

      const missing = [...creditIdSet].filter((id) => !creditsById.has(id));
      if (missing.length) {
        setInvoiceError(
          "Expand the vendor rows for selected credits (or select the vendor row) so amounts can be confirmed."
        );
        return;
      }

      const credits = [...creditIdSet]
        .map((id) => creditsById.get(id))
        .filter((row): row is InvoiceBuilderCreditDraft => Boolean(row));
      if (!credits.length) {
        setInvoiceError("Select at least one vendor row or open credit to invoice.");
        return;
      }

      const sourceRows = selectedRows.length
        ? selectedRows
        : [...new Set([...creditIdSet].map((id) => rowByCreditId.get(id)).filter(Boolean))] as BigBookVendorActorOutstandingRow[];

      const primary = sourceRows[0] ?? rows.find((row) => row.currency === credits[0].currency_code);
      const currencies = new Set(credits.map((row) => row.currency_code));
      const vendors = new Set(sourceRows.map((row) => primaryGroupLabel(row, isFutureKind)));

      setInvoiceSeed({
        vendor_name:
          vendors.size === 1
            ? [...vendors][0]
            : primary
              ? primaryGroupLabel(primary, isFutureKind)
              : "",
        actor_display_name: primary?.actor_display_name || "—",
        currency:
          currencies.size === 1
            ? ([...currencies][0] as InvoiceBuilderSeed["currency"])
            : primary?.currency || credits[0].currency_code,
        credits,
        label: `${credits.length} selected open credit${credits.length === 1 ? "" : "s"}`
      });
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : "Failed to prepare invoice.");
    }
  }

  function openEditDialogFromChooser() {
    if (!pendingSettle) return;
    setSettleError(null);
    setEditDraft({
      mode: settleMode,
      credits: pendingSettle.credits,
      label: pendingSettle.label
    });
    setPendingSettle(null);
  }

  async function submitBulkSettleEdit(payload: {
    entry_date: string;
    currency_code: BulkSettleCurrency;
    amount: number;
    settlement_conversion_rate?: number;
    settlement_note: string;
    close_credits: boolean;
    explanation: string;
    profit_amount?: number;
    kurs_rate?: number;
    kurs_amount?: number;
  }) {
    if (!editDraft) return;
    setSettleSubmitting(true);
    setSettleError(null);
    try {
      const body: Record<string, unknown> = {
        credit_entry_ids: editDraft.credits.map((row) => row.id),
        mode: editDraft.mode,
        entry_date: payload.entry_date,
        close_credits: payload.close_credits,
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
      if (
        payload.profit_amount != null &&
        Number.isFinite(payload.profit_amount) &&
        payload.profit_amount > 0
      ) {
        body.profit_amount = payload.profit_amount;
      }
      if (payload.kurs_rate != null && Number.isFinite(payload.kurs_rate)) {
        body.kurs_rate = payload.kurs_rate;
      }
      if (
        payload.kurs_amount != null &&
        Number.isFinite(payload.kurs_amount) &&
        payload.kurs_amount > 0
      ) {
        body.kurs_amount = payload.kurs_amount;
      }

      const response = await secureFetch("/api/big-book/entries/bulk-settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setSettleError(extractApiError(data.error, "Failed to settle selected credits."));
        return;
      }
      setSettleMessage(
        editDraft.mode === "single"
          ? `Created 1 settlement covering ${editDraft.credits.length} credit(s).`
          : `Created ${editDraft.credits.length} settlement record(s).`
      );
      setEditDraft(null);
      setSelectedRowKeys(new Set());
      setSelectedCreditIds(new Set());
      setDetailsByKey({});
      setExpandedKeys(new Set());
      onSettled?.();
    } catch {
      setSettleError("Failed to settle credits due to a network error.");
    } finally {
      setSettleSubmitting(false);
    }
  }

  async function prepareActualizeFromRow(row: BigBookVendorActorOutstandingRow) {
    if (!isFutureKind) return;
    setActualizeError(null);
    setActualizeMessage(null);
    setRowActualizeLoadingKey(row.row_key);
    try {
      const detailRows = await fetchDetailRows(row);
      if (!detailRows.length) {
        setActualizeError("No open Future Credits found for this vendor row.");
        return;
      }
      setPendingActualize({
        credits: detailRows.map((entry) => ({
          id: entry.id,
          expected_updated_at: entry.updated_at,
          explanation: entry.explanation,
          amount: entry.amount
        })),
        currency: row.currency,
        label: `${row.type_name} · Actor ${row.actor_display_name}`
      });
    } catch (error) {
      setActualizeError(
        error instanceof Error ? error.message : "Failed to load Future Credits to actualize."
      );
    } finally {
      setRowActualizeLoadingKey(null);
    }
  }

  function prepareActualizeFromEntry(entry: BigBookVendorActorOutstandingEntry) {
    if (!isFutureKind) return;
    setActualizeError(null);
    setActualizeMessage(null);
    setPendingActualize({
      credits: [
        {
          id: entry.id,
          expected_updated_at: entry.updated_at,
          explanation: entry.explanation,
          amount: entry.amount
        }
      ],
      currency: entry.currency_code,
      label: entry.explanation
    });
  }

  async function submitActualize() {
    if (!pendingActualize) return;
    setActualizeSubmitting(true);
    setActualizeError(null);
    try {
      for (const credit of pendingActualize.credits) {
        const response = await secureFetch("/api/big-book/entries/actualize", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: credit.id,
            expected_updated_at: credit.expected_updated_at,
            actualized: true
          })
        });
        if (handleUnauthorizedResponse(response)) return;
        const data = await response.json();
        if (!response.ok) {
          setActualizeError(extractApiError(data.error, "Failed to actualize Future Credit."));
          return;
        }
      }
      setActualizeMessage(
        pendingActualize.credits.length === 1
          ? "Future Credit actualized to Credit."
          : `Actualized ${pendingActualize.credits.length} Future Credits to Credit.`
      );
      setPendingActualize(null);
      setSelectedRowKeys(new Set());
      setSelectedCreditIds(new Set());
      setDetailsByKey({});
      setExpandedKeys(new Set());
      onSettled?.();
    } catch {
      setActualizeError("Failed to actualize Future Credit due to a network error.");
    } finally {
      setActualizeSubmitting(false);
    }
  }

  // Prefer unique open-credit count so parent+child sync does not double-count.
  const selectedCount = useMemo(() => {
    if (selectedCreditIds.size > 0) return selectedCreditIds.size;
    // Parents selected before detail fetch completes — approximate from open counts.
    let pending = 0;
    for (const row of rows) {
      if (!selectedRowKeys.has(row.row_key)) continue;
      const cacheKey = detailCacheKey(row, detailFilters, creditKind);
      const details = detailsByKey[cacheKey];
      if (details?.status === "ok") continue;
      pending += row.open_credit_count;
    }
    return pending;
  }, [selectedCreditIds, selectedRowKeys, rows, detailFilters, detailsByKey, creditKind]);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={selectedCount === 0}
          onClick={() => void prepareSettleFromSelection()}
        >
          Settle selected ({selectedCount || 0})
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={selectedCount === 0}
          onClick={() => void prepareInvoiceFromSelection()}
        >
          Create invoice ({selectedCount || 0})
        </button>
        {settleMessage ? (
          <p className="text-sm text-[rgb(var(--success))]">{settleMessage}</p>
        ) : null}
        {actualizeMessage ? (
          <p className="text-sm text-[rgb(var(--success))]">{actualizeMessage}</p>
        ) : null}
        {settleError && !pendingSettle && !editDraft ? (
          <p className="text-sm text-[rgb(var(--danger))]">{settleError}</p>
        ) : null}
        {actualizeError && !pendingActualize ? (
          <p className="text-sm text-[rgb(var(--danger))]">{actualizeError}</p>
        ) : null}
        {invoiceError && !invoiceSeed ? (
          <p className="text-sm text-[rgb(var(--danger))]">{invoiceError}</p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="data-table min-w-[860px]">
          <thead>
            <tr>
              <th className="w-10 px-3 py-2" aria-label="Select" />
              <th className="w-10 px-3 py-2" aria-label="Expand" />
              <th className="px-3 py-2">
                <button
                  type="button"
                  className="font-semibold"
                  onClick={() => toggleSort(primarySortKey)}
                >
                  {sortLabel(isFutureKind ? "Type" : "Vendor (Owes)", primarySortKey)}
                </button>
              </th>
              <th className="px-3 py-2">
                <button
                  type="button"
                  className="font-semibold"
                  onClick={() => toggleSort("actor_display_name")}
                >
                  {sortLabel("Actor (Owed)", "actor_display_name")}
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
              <th className="px-3 py-2">
                {isFutureKind ? "Open Future Credits" : "Open Credits"}
              </th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, index) => {
              const cacheKey = detailCacheKey(row, detailFilters, creditKind);
              const expanded = expandedKeys.has(cacheKey);
              const details = detailsByKey[cacheKey];
              const detailIds =
                details?.status === "ok" ? details.rows.map((entry) => entry.id) : null;
              const checkState = parentCheckState(
                detailIds,
                selectedCreditIds,
                selectedRowKeys.has(row.row_key)
              );
              return (
                <OutstandingSummaryRows
                  key={row.row_key}
                  row={row}
                  index={index}
                  expanded={expanded}
                  details={details}
                  checkState={checkState}
                  selectedCreditIds={selectedCreditIds}
                  creditKind={creditKind}
                  settleLoading={rowSettleLoadingKey === row.row_key}
                  invoiceLoading={invoiceLoadingKey === row.row_key}
                  actualizeLoading={rowActualizeLoadingKey === row.row_key}
                  onToggleExpand={() => toggleExpanded(row)}
                  onToggleSelected={() => void toggleRowSelected(row)}
                  onToggleCredit={(creditId) => toggleCreditSelected(row, creditId)}
                  onSetCreditsSelected={(creditIds, selected) =>
                    setCreditsSelected(row, creditIds, selected)
                  }
                  onSettleRow={() => void prepareSettleFromRow(row)}
                  onInvoiceRow={() => void prepareInvoiceFromRow(row)}
                  onActualizeRow={() => void prepareActualizeFromRow(row)}
                  onActualizeEntry={prepareActualizeFromEntry}
                />
              );
            })}
            {!rows.length ? (
              <TableEmptyState
                colSpan={columnCount}
                message={
                  isFutureKind ? "No open Future Credits right now." : "No open credits right now."
                }
              />
            ) : null}
          </tbody>
          {currencySubtotals.length ? (
            <tfoot className="border-t border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]">
              {currencySubtotals.map((subtotal) => (
                <tr key={subtotal.currency}>
                  <td className="px-3 py-2" aria-hidden="true" />
                  <td className="px-3 py-2" aria-hidden="true" />
                  <td className="px-3 py-2 font-medium" colSpan={2}>
                    Subtotal
                  </td>
                  <td className="px-3 py-2 font-medium">{subtotal.currency}</td>
                  <td
                    className={`px-3 py-2 font-medium ${getAmountColorClass(subtotal.outstanding)}`}
                  >
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
        open={Boolean(pendingSettle)}
        onOpenChange={(open) => {
          if (!open && !settleSubmitting) {
            setPendingSettle(null);
            setSettleError(null);
          }
        }}
        title={isFutureKind ? "Settle Future Credits?" : "Settle open credits?"}
        confirmLabel="Continue to edit settlement"
        confirming={false}
        closeOnBackdrop={false}
        confirmDisabled={!pendingSettle}
        onConfirm={openEditDialogFromChooser}
        description={
          pendingSettle ? (
            <div className="space-y-3 text-sm">
              <p>
                Settling <span className="font-medium">{pendingSettle.credits.length}</span> open
                {isFutureKind ? " Future Credit" : " credit"}
                {pendingSettle.credits.length === 1 ? "" : "s"} for{" "}
                <span className="font-medium">{pendingSettle.label}</span>.
              </p>
              <p>
                Total:{" "}
                <span className="font-medium">
                  {formatAmount(pendingSettle.totalAmount, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 4
                  })}{" "}
                  {pendingSettle.currency}
                </span>
              </p>
              <p className="text-xs text-muted">
                Next you&apos;ll review and edit the settlement (currency, USDT rate, amount, note)
                before it is saved.
              </p>
              <fieldset className="space-y-2 rounded-md border border-[rgb(var(--border))] p-3">
                <legend className="px-1 text-xs font-medium uppercase text-muted">
                  Settlement records
                </legend>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    className="mt-1"
                    name="bulk-settle-mode"
                    checked={settleMode === "single"}
                    onChange={() => setSettleMode("single")}
                  />
                  <span>
                    <span className="font-medium">One settlement for all</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Default. Opens one settlement editor covering the selected credits.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    className="mt-1"
                    name="bulk-settle-mode"
                    checked={settleMode === "per_credit"}
                    onChange={() => setSettleMode("per_credit")}
                  />
                  <span>
                    <span className="font-medium">One settlement per credit</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Opens the settlement editor, then creates one payment per selected credit.
                    </span>
                  </span>
                </label>
              </fieldset>
              {settleError ? <p className="text-[rgb(var(--danger))]">{settleError}</p> : null}
            </div>
          ) : null
        }
      />

      <BigBookBulkSettleEditModal
        draft={editDraft}
        open={Boolean(editDraft)}
        submitting={settleSubmitting}
        error={settleError}
        onOpenChange={(open) => {
          if (!open && !settleSubmitting) {
            setEditDraft(null);
            setSettleError(null);
          }
        }}
        onSubmit={submitBulkSettleEdit}
      />

      <ConfirmDialog
        open={Boolean(pendingActualize)}
        onOpenChange={(open) => {
          if (!open && !actualizeSubmitting) {
            setPendingActualize(null);
            setActualizeError(null);
          }
        }}
        title="Actualize Future Credit?"
        confirmLabel={
          pendingActualize && pendingActualize.credits.length > 1
            ? `Actualize ${pendingActualize.credits.length} credits`
            : "Actualize to Credit"
        }
        confirming={actualizeSubmitting}
        closeOnBackdrop={false}
        confirmDisabled={!pendingActualize}
        onConfirm={() => void submitActualize()}
        description={
          pendingActualize ? (
            <div className="space-y-3 text-sm">
              <p>
                Actualizing{" "}
                <span className="font-medium">{pendingActualize.credits.length}</span> Future
                Credit{pendingActualize.credits.length === 1 ? "" : "s"} for{" "}
                <span className="font-medium">{pendingActualize.label}</span>.
              </p>
              <p>
                This moves them into Outstanding Credit so the obligation itself is included in cash
                totals. Settlements can already be recorded without actualizing.
              </p>
              {actualizeError ? <p className="text-[rgb(var(--danger))]">{actualizeError}</p> : null}
            </div>
          ) : null
        }
      />

      <BigBookInvoiceBuilderModal
        open={Boolean(invoiceSeed)}
        seed={invoiceSeed}
        onOpenChange={(open) => {
          if (!open) {
            setInvoiceSeed(null);
            setInvoiceError(null);
          }
        }}
      />
    </div>
  );
}

function OutstandingSummaryRows({
  row,
  index,
  expanded,
  details,
  checkState,
  selectedCreditIds,
  creditKind,
  settleLoading,
  invoiceLoading,
  actualizeLoading,
  onToggleExpand,
  onToggleSelected,
  onToggleCredit,
  onSetCreditsSelected,
  onSettleRow,
  onInvoiceRow,
  onActualizeRow,
  onActualizeEntry
}: {
  row: BigBookVendorActorOutstandingRow;
  index: number;
  expanded: boolean;
  details: DetailState | undefined;
  checkState: ParentCheckState;
  selectedCreditIds: Set<string>;
  creditKind: OutstandingCreditKind;
  settleLoading: boolean;
  invoiceLoading: boolean;
  actualizeLoading: boolean;
  onToggleExpand: () => void;
  onToggleSelected: () => void;
  onToggleCredit: (creditId: string) => void;
  onSetCreditsSelected: (creditIds: string[], selected: boolean) => void;
  onSettleRow: () => void;
  onInvoiceRow: () => void;
  onActualizeRow: () => void;
  onActualizeEntry: (entry: BigBookVendorActorOutstandingEntry) => void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const isFutureKind = creditKind === "future";
  const actionsBusy = settleLoading || invoiceLoading || actualizeLoading;
  const rowLabel = primaryGroupLabel(row, isFutureKind);
  const columnCount = 8;

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = checkState === "indeterminate";
    }
  }, [checkState]);

  return (
    <>
      <tr className={`border-b border-[rgb(var(--border))] ${rowStripeClass(index)}`}>
        <td className="px-3 py-2">
          <input
            ref={checkboxRef}
            type="checkbox"
            className="h-4 w-4"
            aria-label={`Select outstanding for ${rowLabel}`}
            aria-checked={
              checkState === "indeterminate" ? "mixed" : checkState === "checked"
            }
            checked={checkState === "checked"}
            onChange={onToggleSelected}
            onClick={(event) => event.stopPropagation()}
          />
        </td>
        <td className="px-3 py-2">
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-xs"
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Collapse open ${isFutureKind ? "Future Credits" : "credits"} for ${rowLabel}`
                : `Expand open ${isFutureKind ? "Future Credits" : "credits"} for ${rowLabel}`
            }
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand();
            }}
          >
            {expanded ? "▾" : "▸"}
          </button>
        </td>
        <td className="px-3 py-2">{primaryGroupLabel(row, isFutureKind)}</td>
        <td className="px-3 py-2">{row.actor_display_name}</td>
        <td className="px-3 py-2">{row.currency}</td>
        <td className={`px-3 py-2 font-medium ${getAmountColorClass(row.outstanding)}`}>
          {formatAmount(row.outstanding, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4
          })}
        </td>
        <td className="px-3 py-2">{row.open_credit_count}</td>
        <td className="px-3 py-2 text-right">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={actionsBusy || row.open_credit_count === 0}
              onClick={(event) => {
                event.stopPropagation();
                onSettleRow();
              }}
            >
              {settleLoading ? "Loading…" : "Settle"}
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={actionsBusy || row.open_credit_count === 0}
              onClick={(event) => {
                event.stopPropagation();
                onInvoiceRow();
              }}
            >
              {invoiceLoading ? "Loading…" : "Create invoice"}
            </button>
            {isFutureKind ? (
              <button
                type="button"
                className="btn-secondary btn-sm !border-[rgb(var(--warning)/0.45)] !text-[rgb(var(--warning))] hover:!bg-[rgb(var(--warning)/0.12)]"
                disabled={actionsBusy || row.open_credit_count === 0}
                onClick={(event) => {
                  event.stopPropagation();
                  onActualizeRow();
                }}
              >
                {actualizeLoading ? "Loading…" : "Actualize"}
              </button>
            ) : null}
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]/50">
          <td className="px-3 py-3" colSpan={columnCount}>
            <OutstandingNestedTable
              details={details}
              creditKind={creditKind}
              selectedCreditIds={selectedCreditIds}
              onToggleCredit={onToggleCredit}
              onSetCreditsSelected={onSetCreditsSelected}
              onActualizeEntry={onActualizeEntry}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function OutstandingNestedTable({
  details,
  creditKind,
  selectedCreditIds,
  onToggleCredit,
  onSetCreditsSelected,
  onActualizeEntry
}: {
  details: DetailState | undefined;
  creditKind: OutstandingCreditKind;
  selectedCreditIds: Set<string>;
  onToggleCredit: (creditId: string) => void;
  onSetCreditsSelected: (creditIds: string[], selected: boolean) => void;
  onActualizeEntry: (entry: BigBookVendorActorOutstandingEntry) => void;
}) {
  const isFutureKind = creditKind === "future";
  if (!details || details.status === "loading") {
    return (
      <p className="text-sm text-muted">
        {isFutureKind ? "Loading Future Credits…" : "Loading open credits…"}
      </p>
    );
  }
  if (details.status === "error") {
    return <p className="text-sm text-[rgb(var(--danger))]">{details.message}</p>;
  }
  if (!details.rows.length) {
    return (
      <p className="text-sm text-muted">
        {isFutureKind
          ? "No open Future Credits for this vendor and actor."
          : "No open credits for this vendor and actor."}
      </p>
    );
  }

  return (
    <OutstandingNestedTableLoaded
      rows={details.rows}
      totalCount={details.totalCount}
      creditKind={creditKind}
      selectedCreditIds={selectedCreditIds}
      onToggleCredit={onToggleCredit}
      onSetCreditsSelected={onSetCreditsSelected}
      onActualizeEntry={onActualizeEntry}
    />
  );
}

function OutstandingNestedTableLoaded({
  rows,
  totalCount,
  creditKind,
  selectedCreditIds,
  onToggleCredit,
  onSetCreditsSelected,
  onActualizeEntry
}: {
  rows: BigBookVendorActorOutstandingEntry[];
  totalCount: number;
  creditKind: OutstandingCreditKind;
  selectedCreditIds: Set<string>;
  onToggleCredit: (creditId: string) => void;
  onSetCreditsSelected: (creditIds: string[], selected: boolean) => void;
  onActualizeEntry: (entry: BigBookVendorActorOutstandingEntry) => void;
}) {
  const isFutureKind = creditKind === "future";
  const truncated = totalCount > rows.length;
  const allChildIds = rows.map((entry) => entry.id);
  const allChildrenSelected = allChildIds.every((id) => selectedCreditIds.has(id));
  const someChildrenSelected = allChildIds.some((id) => selectedCreditIds.has(id));
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someChildrenSelected && !allChildrenSelected;
    }
  }, [someChildrenSelected, allChildrenSelected]);

  const groupedRows = useMemo(() => {
    if (isFutureKind) {
      return rows.map((entry) => ({ kind: "entry" as const, entry }));
    }
    const sorted = [...rows].sort((a, b) => a.type_name.localeCompare(b.type_name));
    const sections: Array<
      { kind: "header"; typeName: string } | { kind: "entry"; entry: BigBookVendorActorOutstandingEntry }
    > = [];
    let lastType: string | null = null;
    for (const entry of sorted) {
      if (entry.type_name !== lastType) {
        sections.push({ kind: "header", typeName: entry.type_name });
        lastType = entry.type_name;
      }
      sections.push({ kind: "entry", entry });
    }
    return sections;
  }, [isFutureKind, rows]);

  return (
    <div className="space-y-2">
      {truncated ? (
        <p className="text-xs text-muted">
          Showing first {rows.length} of {totalCount} open{" "}
          {isFutureKind ? "Future Credits" : "credits"}.
        </p>
      ) : null}
      <table className="data-table min-w-full">
        <thead className="text-xs text-muted">
          <tr>
            <th className="px-3 py-1.5 font-medium">
              <input
                ref={selectAllRef}
                type="checkbox"
                className="h-4 w-4"
                aria-label={`Select all open ${isFutureKind ? "Future Credits" : "credits"} in this vendor row`}
                aria-checked={
                  someChildrenSelected && !allChildrenSelected
                    ? "mixed"
                    : allChildrenSelected
                }
                checked={allChildrenSelected}
                onChange={() => onSetCreditsSelected(allChildIds, !allChildrenSelected)}
              />
            </th>
            <th className="px-3 py-1.5 font-medium">Date</th>
            <th className="px-3 py-1.5 font-medium">In/Out</th>
            {!isFutureKind ? <th className="px-3 py-1.5 font-medium">Vendor</th> : null}
            <th className="px-3 py-1.5 font-medium">Type</th>
            <th className="px-3 py-1.5 font-medium">Explanation</th>
            <th className="px-3 py-1.5 font-medium">Amount</th>
            <th className="px-3 py-1.5 font-medium">Remark</th>
            <th className="px-3 py-1.5 font-medium">Ledger</th>
            {isFutureKind ? (
              <th className="px-3 py-1.5 font-medium text-right">Actions</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {groupedRows.map((item, index) => {
            if (item.kind === "header") {
              return (
                <tr
                  key={`type-header-${item.typeName}-${index}`}
                  className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))]"
                >
                  <td
                    className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted"
                    colSpan={isFutureKind ? 9 : 9}
                  >
                    Type · {item.typeName}
                  </td>
                </tr>
              );
            }
            const entry = item.entry;
            const amount = signedAmount(entry);
            return (
              <tr key={entry.id} className="border-b border-[rgb(var(--border))] align-top">
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    aria-label={`Select credit ${entry.explanation}`}
                    checked={selectedCreditIds.has(entry.id)}
                    onChange={() => onToggleCredit(entry.id)}
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
                {!isFutureKind ? (
                  <td className="px-3 py-1.5">{entry.vendor_name ?? "(No vendor)"}</td>
                ) : null}
                <td className="px-3 py-1.5">{entry.type_name}</td>
                <td className="px-3 py-1.5">
                  <div className="space-y-1">
                    <div>{entry.explanation}</div>
                    {isFutureKind ? (
                      <span className="inline-flex rounded bg-[rgb(var(--warning)/0.18)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--warning))]">
                        Future Credit
                      </span>
                    ) : (
                      <span className="inline-flex rounded bg-[rgb(var(--success)/0.15)] px-2 py-0.5 text-xs font-medium text-[rgb(var(--success))]">
                        Credit
                      </span>
                    )}
                  </div>
                </td>
                <td className={`px-3 py-1.5 font-medium tabular-nums ${getAmountColorClass(amount)}`}>
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
                {isFutureKind ? (
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      className="btn-secondary btn-sm !border-[rgb(var(--warning)/0.45)] !text-[rgb(var(--warning))] hover:!bg-[rgb(var(--warning)/0.12)]"
                      onClick={(event) => {
                        event.stopPropagation();
                        onActualizeEntry(entry);
                      }}
                    >
                      Actualize
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
