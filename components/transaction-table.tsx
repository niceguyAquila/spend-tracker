"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type {
  AppRole,
  ExpenseCategory,
  ExpenseStaff,
  ExpenseType,
  ExpenseWithNames,
  SpendingCurrencyCode
} from "@/lib/types";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BlockingOverlay } from "@/components/ui/blocking-overlay";
import { TableEmptyState } from "@/components/ui/table-empty-state";
import { Modal } from "@/components/ui/modal";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SpendingCsvToolbar } from "@/components/spending-csv-toolbar";
import { SpendingEntryRow } from "@/components/spending-entry-row";
import { SpendingEntryFields } from "@/components/spending-entry-fields";
import { BigBookCurrencyTotals } from "@/components/big-book-currency-totals";
import { formatAmountInput, parseAmountInput } from "@/components/big-book-entry-fields";
import { formatAmount, formatDateDisplay } from "@/lib/display-format";
import { summarizeCurrencies } from "@/lib/big-book/totals";
import { sliceForPage, useTablePagination } from "@/lib/table-pagination";
import { TablePaginationBar } from "@/components/ui/table-pagination-bar";
import { rowStripeClass } from "@/lib/ui/table";
import { useColumnWidths } from "@/lib/ui/use-column-widths";
import {
  createEmptySpendingForm,
  describeMissingFields,
  missingSpendingFields,
  type SpendingEntryForm
} from "@/lib/spending/entry-form-validation";

type Props = {
  rows: ExpenseWithNames[];
  categories: ExpenseCategory[];
  types: ExpenseType[];
  staff: ExpenseStaff[];
  activeMonth: string;
  monthOptions: string[];
  role: AppRole;
};

type SortKey =
  | "expense_date"
  | "type_name"
  | "category_name"
  | "staff_name"
  | "currency_code"
  | "amount";
type SortDirection = "asc" | "desc";

const DESC_DEFAULT_SORT_KEYS = new Set<SortKey>(["expense_date", "amount"]);

const SPENDING_COLUMN_WIDTH_DEFAULTS: Record<string, number> = {
  expense_date: 110,
  type_name: 130,
  category_name: 140,
  description: 220,
  staff_name: 120,
  currency_code: 90,
  amount: 150,
  remarks: 180,
  actions: 100
};
const SPENDING_COLUMN_KEYS = Object.keys(SPENDING_COLUMN_WIDTH_DEFAULTS);
const SPENDING_COLUMN_COUNT = SPENDING_COLUMN_KEYS.length;

const CURRENCY_OPTIONS: SpendingCurrencyCode[] = ["IDR", "MYR", "USDT", "TRX"];

type AppliedFilters = {
  query: string;
  dateFrom: string;
  dateTo: string;
  month: string;
  typeIds: string[];
  categoryIds: string[];
  staffIds: string[];
  currencies: SpendingCurrencyCode[];
  directions: Array<"spending" | "profit">;
};

function formatMonthLabel(monthKey: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(`${monthKey}T00:00:00`)
  );
}

function directionLabel(direction: "spending" | "profit") {
  return direction === "profit" ? "In" : "Out";
}

function signedExpenseAmount(row: Pick<ExpenseWithNames, "amount" | "entry_direction">) {
  const amount = Math.abs(Number(row.amount));
  return row.entry_direction === "profit" ? amount : -amount;
}

function sortValue(row: ExpenseWithNames, key: SortKey) {
  if (key === "type_name") return row.type_name ?? "";
  if (key === "staff_name") return row.staff_name ?? "";
  return String(row[key] ?? "");
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

function filtersEqual(a: AppliedFilters, b: AppliedFilters) {
  return (
    a.query === b.query &&
    a.dateFrom === b.dateFrom &&
    a.dateTo === b.dateTo &&
    a.month === b.month &&
    arraysEqual(a.typeIds, b.typeIds) &&
    arraysEqual(a.categoryIds, b.categoryIds) &&
    arraysEqual(a.staffIds, b.staffIds) &&
    arraysEqual(a.currencies, b.currencies) &&
    arraysEqual(a.directions, b.directions)
  );
}

function extractApiError(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim().length > 0) return error;
  if (error && typeof error === "object") {
    const maybeZod = error as { formErrors?: unknown; fieldErrors?: Record<string, unknown> };
    if (Array.isArray(maybeZod.formErrors)) {
      const formError = maybeZod.formErrors.find((item) => typeof item === "string" && item.trim().length > 0);
      if (typeof formError === "string") return formError;
    }
    if (maybeZod.fieldErrors && typeof maybeZod.fieldErrors === "object") {
      for (const value of Object.values(maybeZod.fieldErrors)) {
        if (Array.isArray(value)) {
          const fieldError = value.find((item) => typeof item === "string" && item.trim().length > 0);
          if (typeof fieldError === "string") return fieldError;
        }
      }
    }
  }
  return fallback;
}

function formFromRow(row: ExpenseWithNames): SpendingEntryForm {
  return {
    expense_date: row.expense_date,
    entry_direction: row.entry_direction,
    type_id: row.type_id ?? "",
    category_id: row.category_id,
    description: row.description ?? "",
    staff_id: row.staff_id ?? "",
    currency_code: row.currency_code,
    amount: formatAmountInput(String(row.amount)),
    remarks: row.remarks ?? ""
  };
}

export function TransactionTable({
  rows,
  categories,
  types,
  staff,
  activeMonth,
  monthOptions,
  role
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const canWrite = role === "finance" || role === "admin";

  const emptyFilters = useMemo<AppliedFilters>(
    () => ({
      query: "",
      dateFrom: "",
      dateTo: "",
      month: activeMonth,
      typeIds: [],
      categoryIds: [],
      staffIds: [],
      currencies: [],
      directions: []
    }),
    [activeMonth]
  );

  const [draftFilters, setDraftFilters] = useState<AppliedFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>(emptyFilters);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    setDraftFilters((prev) => ({ ...prev, month: activeMonth }));
    setAppliedFilters((prev) => ({ ...prev, month: activeMonth }));
  }, [activeMonth]);

  const [sortKey, setSortKey] = useState<SortKey>("expense_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const {
    widths: columnWidths,
    totalWidth: ledgerTableWidth,
    isModified: columnWidthsModified,
    resetWidths,
    getResizeHandleProps
  } = useColumnWidths({
    storageKey: "spending-ledger-column-widths",
    defaults: SPENDING_COLUMN_WIDTH_DEFAULTS,
    schemaVersion: 1,
    minWidth: 60
  });

  const [openActionMenu, setOpenActionMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<SpendingEntryForm>(() =>
    createEmptySpendingForm({ defaultCategoryId: categories[0]?.id })
  );
  const [editForm, setEditForm] = useState<SpendingEntryForm>(() =>
    createEmptySpendingForm({ defaultCategoryId: categories[0]?.id })
  );
  const [createMode, setCreateMode] = useState<"create" | "create_another">("create");
  const [pendingCreateConfirm, setPendingCreateConfirm] = useState(false);
  const [pendingEditConfirm, setPendingEditConfirm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ExpenseWithNames | null>(null);

  const [saving, setSaving] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const criticalPending = saving || deleteSubmitting;

  const filtersDirty = !filtersEqual(draftFilters, appliedFilters);
  const advancedDraftCount =
    draftFilters.typeIds.length +
    draftFilters.categoryIds.length +
    draftFilters.staffIds.length +
    draftFilters.currencies.length +
    draftFilters.directions.length;
  const draftFiltersActive =
    Boolean(draftFilters.query.trim()) ||
    Boolean(draftFilters.dateFrom) ||
    Boolean(draftFilters.dateTo) ||
    draftFilters.month !== activeMonth ||
    advancedDraftCount > 0;
  const filtersActive =
    Boolean(appliedFilters.query.trim()) ||
    Boolean(appliedFilters.dateFrom) ||
    Boolean(appliedFilters.dateTo) ||
    appliedFilters.month !== activeMonth ||
    appliedFilters.typeIds.length > 0 ||
    appliedFilters.categoryIds.length > 0 ||
    appliedFilters.staffIds.length > 0 ||
    appliedFilters.currencies.length > 0 ||
    appliedFilters.directions.length > 0;

  const filteredRows = useMemo(() => {
    const normalized = appliedFilters.query.toLowerCase().trim();
    const baseRows = rows.filter((row) => {
      if (normalized) {
        const haystack = [
          row.description ?? "",
          row.remarks ?? "",
          row.type_name ?? "",
          row.category_name,
          row.staff_name ?? ""
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(normalized)) return false;
      }
      if (appliedFilters.dateFrom && row.expense_date < appliedFilters.dateFrom) return false;
      if (appliedFilters.dateTo && row.expense_date > appliedFilters.dateTo) return false;
      if (appliedFilters.typeIds.length && (!row.type_id || !appliedFilters.typeIds.includes(row.type_id))) {
        return false;
      }
      if (appliedFilters.categoryIds.length && !appliedFilters.categoryIds.includes(row.category_id)) {
        return false;
      }
      if (appliedFilters.staffIds.length && (!row.staff_id || !appliedFilters.staffIds.includes(row.staff_id))) {
        return false;
      }
      if (appliedFilters.currencies.length && !appliedFilters.currencies.includes(row.currency_code)) {
        return false;
      }
      if (appliedFilters.directions.length && !appliedFilters.directions.includes(row.entry_direction)) {
        return false;
      }
      return true;
    });

    const sorted = [...baseRows];
    sorted.sort((a, b) => {
      if (sortKey === "amount") {
        const delta = signedExpenseAmount(a) - signedExpenseAmount(b);
        return sortDirection === "asc" ? delta : -delta;
      }
      const cmp = sortValue(a, sortKey).localeCompare(sortValue(b, sortKey), undefined, {
        sensitivity: "base",
        numeric: true
      });
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, appliedFilters, sortKey, sortDirection]);

  const pagination = useTablePagination(filteredRows.length);
  const { setPage } = pagination;
  const pagedRows = useMemo(
    () => sliceForPage(filteredRows, pagination.page, pagination.pageSize),
    [filteredRows, pagination.page, pagination.pageSize]
  );

  useEffect(() => {
    setPage(0);
  }, [
    appliedFilters,
    sortKey,
    sortDirection,
    setPage
  ]);

  const pageTotals = useMemo(() => summarizeCurrencies(pagedRows), [pagedRows]);
  const grandTotals = useMemo(() => summarizeCurrencies(filteredRows), [filteredRows]);

  const createMissing = missingSpendingFields(createForm);
  const editMissing = missingSpendingFields(editForm);
  const createValid = createMissing.length === 0;
  const editValid = editMissing.length === 0;
  const createMissingHint = describeMissingFields(createMissing);
  const editMissingHint = describeMissingFields(editMissing);

  function applyFilters() {
    const next = { ...draftFilters };
    setAppliedFilters(next);
    if (next.month !== activeMonth) {
      const params = new URLSearchParams();
      params.set("month", next.month);
      router.push(`${pathname}?${params.toString()}`);
    }
  }

  function resetFilters() {
    const next = {
      query: "",
      dateFrom: "",
      dateTo: "",
      month: activeMonth,
      typeIds: [],
      categoryIds: [],
      staffIds: [],
      currencies: [],
      directions: [] as Array<"spending" | "profit">
    };
    setDraftFilters(next);
    setAppliedFilters(next);
    setAdvancedOpen(false);
    if (activeMonth) {
      const params = new URLSearchParams();
      params.set("month", activeMonth);
      router.push(`${pathname}?${params.toString()}`);
    } else {
      router.push(pathname);
    }
  }

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(DESC_DEFAULT_SORT_KEYS.has(nextKey) ? "desc" : "asc");
  }

  function sortMarker(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  }

  function ariaSortFor(key: SortKey): "ascending" | "descending" | "none" {
    if (sortKey !== key) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  }

  function toggleActionMenu(rowId: string, triggerEl: HTMLButtonElement) {
    if (openActionMenu?.id === rowId) {
      setOpenActionMenu(null);
      return;
    }
    const rect = triggerEl.getBoundingClientRect();
    const menuWidth = 176;
    const viewportPadding = 8;
    const left = Math.max(
      viewportPadding,
      Math.min(window.innerWidth - menuWidth - viewportPadding, rect.right - menuWidth)
    );
    setOpenActionMenu({
      id: rowId,
      top: rect.bottom + 6,
      left
    });
  }

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!openActionMenu) return;
      const root = actionMenuRef.current;
      if (root && event.target instanceof Node && root.contains(event.target)) return;
      setOpenActionMenu(null);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenActionMenu(null);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openActionMenu]);

  function openCreateModal() {
    setCreateForm(createEmptySpendingForm({ defaultCategoryId: categories[0]?.id }));
    setCreateMode("create");
    setError(null);
    setCreateModalOpen(true);
  }

  function startEdit(row: ExpenseWithNames) {
    setOpenActionMenu(null);
    setEditingId(row.id);
    setEditForm(formFromRow(row));
    setError(null);
    setEditModalOpen(true);
  }

  async function saveCreatedEntry() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const amountValue = Number(parseAmountInput(createForm.amount));
      const response = await secureFetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_date: createForm.expense_date,
          entry_direction: createForm.entry_direction,
          currency_code: createForm.currency_code,
          category_id: createForm.category_id,
          type_id: createForm.type_id || null,
          staff_id: createForm.staff_id || null,
          amount: amountValue,
          description: createForm.description,
          remarks: createForm.remarks
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to save transaction."));
        return;
      }
      setMessage("Transaction saved.");
      setPendingCreateConfirm(false);
      if (createMode === "create_another") {
        setCreateForm((prev) => ({ ...prev, amount: "", description: "", remarks: "" }));
      } else {
        setCreateModalOpen(false);
      }
      router.refresh();
    } catch {
      setError("Failed to save transaction due to a network error.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEditedEntry() {
    if (!editingId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const amountValue = Number(parseAmountInput(editForm.amount));
      const response = await secureFetch("/api/expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          expense_date: editForm.expense_date,
          entry_direction: editForm.entry_direction,
          currency_code: editForm.currency_code,
          category_id: editForm.category_id,
          type_id: editForm.type_id || null,
          staff_id: editForm.staff_id || null,
          amount: amountValue,
          description: editForm.description,
          remarks: editForm.remarks
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to update transaction."));
        return;
      }
      setMessage("Transaction updated.");
      setPendingEditConfirm(false);
      setEditModalOpen(false);
      setEditingId(null);
      router.refresh();
    } catch {
      setError("Failed to update transaction due to a network error.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteExpense() {
    if (!pendingDelete) return;
    setDeleteSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch(`/api/expenses?id=${encodeURIComponent(pendingDelete.id)}`, {
        method: "DELETE"
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to delete transaction."));
        return;
      }
      setMessage("Transaction deleted.");
      setPendingDelete(null);
      router.refresh();
    } catch {
      setError("Failed to delete transaction due to a network error.");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const actionTarget = openActionMenu ? rows.find((row) => row.id === openActionMenu.id) : null;

  const sortableHeaders: Array<{ key: SortKey; label: string; align?: "right" }> = [
    { key: "expense_date", label: "Date" },
    { key: "type_name", label: "Type" },
    { key: "category_name", label: "Category" }
  ];

  return (
    <section className="card relative" aria-busy={criticalPending}>
      <div className="sticky top-0 z-30 -mx-4 -mt-4 mb-4 rounded-t-xl border-b border-[rgb(var(--border))] bg-[rgb(var(--surface))] lg:-mx-5 lg:-mt-5">
        <div className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-5">
          <BlockingOverlay
            active={criticalPending}
            label={saving ? "Saving transaction..." : "Deleting transaction..."}
          />
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Transaction Ledger</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={!columnWidthsModified || criticalPending}
              onClick={resetWidths}
              title="Reset column widths"
            >
              Reset columns
            </button>
            <span className="hidden h-6 w-px bg-[rgb(var(--border))] sm:block" aria-hidden="true" />
            <SpendingCsvToolbar
              role={role}
              disabled={criticalPending}
              filters={{
                month: appliedFilters.month,
                dateFrom: appliedFilters.dateFrom,
                dateTo: appliedFilters.dateTo,
                query: appliedFilters.query,
                direction: appliedFilters.directions,
                categoryId: appliedFilters.categoryIds,
                typeId: appliedFilters.typeIds,
                staffId: appliedFilters.staffIds,
                currency: appliedFilters.currencies
              }}
            />
            {canWrite ? (
              <button type="button" className="btn" disabled={criticalPending} onClick={openCreateModal}>
                New Spending Entry
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <form
        className="mb-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          <label className="text-sm text-muted md:col-span-2">
            <span className="mb-1 block">Search</span>
            <input
              className="field w-full"
              placeholder="Search description, remarks, type, category, staff..."
              value={draftFilters.query}
              disabled={criticalPending}
              onChange={(event) =>
                setDraftFilters((prev) => ({ ...prev, query: event.target.value }))
              }
            />
          </label>
          <label className="text-sm text-muted">
            <span className="mb-1 block">Date From</span>
            <input
              className="field w-full"
              type="date"
              value={draftFilters.dateFrom}
              disabled={criticalPending}
              onChange={(event) =>
                setDraftFilters((prev) => ({ ...prev, dateFrom: event.target.value }))
              }
            />
          </label>
          <label className="text-sm text-muted">
            <span className="mb-1 block">Date To</span>
            <input
              className="field w-full"
              type="date"
              value={draftFilters.dateTo}
              disabled={criticalPending}
              onChange={(event) =>
                setDraftFilters((prev) => ({ ...prev, dateTo: event.target.value }))
              }
            />
          </label>
          <label className="text-sm text-muted">
            <span className="mb-1 block">Month</span>
            <select
              className="field w-full"
              value={draftFilters.month}
              disabled={criticalPending}
              onChange={(event) =>
                setDraftFilters((prev) => ({ ...prev, month: event.target.value }))
              }
            >
              {monthOptions.map((monthKey) => (
                <option key={monthKey} value={monthKey}>
                  {formatMonthLabel(monthKey)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {advancedOpen ? (
          <div
            id="spending-advanced-filters"
            className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5"
          >
            <SearchableMultiSelect
              label="Type"
              selectedValues={draftFilters.typeIds}
              options={types.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(next) => setDraftFilters((prev) => ({ ...prev, typeIds: next }))}
              disabled={criticalPending}
            />
            <SearchableMultiSelect
              label="Category"
              selectedValues={draftFilters.categoryIds}
              options={categories.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(next) => setDraftFilters((prev) => ({ ...prev, categoryIds: next }))}
              disabled={criticalPending}
            />
            <SearchableMultiSelect
              label="Staff"
              selectedValues={draftFilters.staffIds}
              options={staff.map((item) => ({ value: item.id, label: item.name }))}
              onChange={(next) => setDraftFilters((prev) => ({ ...prev, staffIds: next }))}
              disabled={criticalPending}
            />
            <SearchableMultiSelect
              label="Currency"
              selectedValues={draftFilters.currencies}
              options={CURRENCY_OPTIONS.map((code) => ({ value: code, label: code }))}
              onChange={(next) =>
                setDraftFilters((prev) => ({
                  ...prev,
                  currencies: next as SpendingCurrencyCode[]
                }))
              }
              disabled={criticalPending}
            />
            <SearchableMultiSelect
              label="Cash flow"
              selectedValues={draftFilters.directions}
              options={[
                { value: "spending", label: "Out" },
                { value: "profit", label: "In" }
              ]}
              onChange={(next) =>
                setDraftFilters((prev) => ({
                  ...prev,
                  directions: next as Array<"spending" | "profit">
                }))
              }
              disabled={criticalPending}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {filtersDirty ? (
            <span className="mr-auto text-xs text-[rgb(var(--warning))]">
              Filters changed — click Apply Filters to update results.
            </span>
          ) : null}
          <button
            type="button"
            className="btn-secondary"
            aria-expanded={advancedOpen}
            aria-controls="spending-advanced-filters"
            onClick={() => setAdvancedOpen((prev) => !prev)}
          >
            Advanced Filters
            {advancedDraftCount > 0 ? (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[rgb(var(--primary))] px-1.5 text-xs text-white">
                {advancedDraftCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={resetFilters}
            disabled={!draftFiltersActive && !filtersActive}
          >
            Reset
          </button>
          <button type="submit" className="btn" disabled={!filtersDirty}>
            Apply Filters
          </button>
        </div>
      </form>

      <div
        className="max-h-[70vh] overflow-auto"
        onScroll={() => {
          if (openActionMenu) setOpenActionMenu(null);
        }}
      >
        <table
          className="data-table data-table-sticky-head table-fixed"
          style={{ width: "100%", minWidth: ledgerTableWidth }}
        >
          {/* Trailing auto-width column soaks up leftover space on wide screens so
              the table fills the card without rescaling the resizable columns. */}
          <colgroup>
            {SPENDING_COLUMN_KEYS.map((key) => (
              <col key={key} style={{ width: columnWidths[key] }} />
            ))}
            <col />
          </colgroup>
          <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
            <tr>
              {sortableHeaders.map(({ key, label }) => (
                <th key={key} className="relative px-3 py-2" aria-sort={ariaSortFor(key)}>
                  <button type="button" className="font-semibold" onClick={() => toggleSort(key)}>
                    {label}
                    {sortMarker(key)}
                  </button>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${label} column`}
                    className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-[rgb(var(--primary)/0.35)]"
                    {...getResizeHandleProps(key)}
                  />
                </th>
              ))}
              <th className="relative px-3 py-2">
                <span className="font-semibold">Description</span>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Description column"
                  className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-[rgb(var(--primary)/0.35)]"
                  {...getResizeHandleProps("description")}
                />
              </th>
              <th className="relative px-3 py-2" aria-sort={ariaSortFor("staff_name")}>
                <button type="button" className="font-semibold" onClick={() => toggleSort("staff_name")}>
                  Staff{sortMarker("staff_name")}
                </button>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Staff column"
                  className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-[rgb(var(--primary)/0.35)]"
                  {...getResizeHandleProps("staff_name")}
                />
              </th>
              <th className="relative px-3 py-2" aria-sort={ariaSortFor("currency_code")}>
                <button
                  type="button"
                  className="font-semibold"
                  onClick={() => toggleSort("currency_code")}
                >
                  Currency{sortMarker("currency_code")}
                </button>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Currency column"
                  className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-[rgb(var(--primary)/0.35)]"
                  {...getResizeHandleProps("currency_code")}
                />
              </th>
              <th className="relative px-3 py-2 text-right" aria-sort={ariaSortFor("amount")}>
                <button type="button" className="font-semibold" onClick={() => toggleSort("amount")}>
                  Amount{sortMarker("amount")}
                </button>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Amount column"
                  className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-[rgb(var(--primary)/0.35)]"
                  {...getResizeHandleProps("amount")}
                />
              </th>
              <th className="relative px-3 py-2">
                <span className="font-semibold">Remarks</span>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Remarks column"
                  className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-[rgb(var(--primary)/0.35)]"
                  {...getResizeHandleProps("remarks")}
                />
              </th>
              <th className="relative px-3 py-2">
                <span className="font-semibold">Actions</span>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Actions column"
                  className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-[rgb(var(--primary)/0.35)]"
                  {...getResizeHandleProps("actions")}
                />
              </th>
              <th aria-hidden="true" className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row, index) => (
              <SpendingEntryRow
                key={row.id}
                row={row}
                stripeClass={rowStripeClass(index)}
                actionMenuOpen={openActionMenu?.id === row.id}
                criticalPending={criticalPending}
                onToggleActionMenu={toggleActionMenu}
              />
            ))}
            {!filteredRows.length ? (
              <TableEmptyState
                colSpan={SPENDING_COLUMN_COUNT + 1}
                message="No transactions found for the selected month and filters."
              />
            ) : null}
          </tbody>
        </table>
      </div>

      {filteredRows.length ? (
        <div className="overflow-x-auto border-t-2 border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]">
          <div className="mx-auto flex w-fit flex-col px-3 py-3">
            <div className="flex items-start gap-x-8">
              <div className="w-56 shrink-0">
                <p className="font-semibold text-[rgb(var(--text))]">Page total</p>
                <p className="text-xs text-muted">
                  this page · {pagedRows.length} transaction{pagedRows.length === 1 ? "" : "s"}
                </p>
              </div>
              <BigBookCurrencyTotals totals={pageTotals} showHeader showNet />
            </div>
            <div className="mt-3 flex items-start gap-x-8 border-t border-[rgb(var(--border))] pt-3">
              <div className="w-56 shrink-0">
                <p className="font-semibold text-[rgb(var(--text))]">Grand total</p>
                <p className="text-xs text-muted">
                  all pages · {filteredRows.length} transaction
                  {filteredRows.length === 1 ? "" : "s"}
                  {filtersActive ? " matching the current filters" : ""}
                </p>
              </div>
              <BigBookCurrencyTotals totals={grandTotals} showHeader showNet />
            </div>
          </div>
        </div>
      ) : null}

      <TablePaginationBar
        totalCount={filteredRows.length}
        page={pagination.page}
        setPage={pagination.setPage}
        pageSize={pagination.pageSize}
        setPageSize={pagination.setPageSize}
        pageCount={pagination.pageCount}
        rangeLabel={pagination.rangeLabel}
      />

      {error ? <p className="mt-3 text-sm text-[rgb(var(--danger))]">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-[rgb(var(--success))]">{message}</p> : null}

      {openActionMenu && actionTarget ? (
        <div
          ref={actionMenuRef}
          role="menu"
          className="fixed z-50 w-44 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1 text-[rgb(var(--text))] shadow-lg"
          style={{ top: openActionMenu.top, left: openActionMenu.left }}
        >
          {canWrite ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-[rgb(var(--surface-muted))]"
              onClick={() => startEdit(actionTarget)}
            >
              Edit
            </button>
          ) : null}
          {canWrite ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full rounded px-2 py-1 text-left text-sm text-[rgb(var(--danger))] hover:bg-[rgb(var(--danger)/0.12)]"
              onClick={() => {
                setOpenActionMenu(null);
                setPendingDelete(actionTarget);
              }}
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}

      <Modal
        open={createModalOpen}
        onOpenChange={(open) => {
          if (!saving) setCreateModalOpen(open);
        }}
        title="New Spending Entry"
        size="xl"
        dismissible={!saving}
        closeOnBackdrop={!saving}
        onSubmitShortcut={
          saving || !createValid
            ? undefined
            : () => {
                setCreateMode("create");
                setPendingCreateConfirm(true);
              }
        }
        footer={
          <>
            {createMissingHint ? (
              <p className="mr-auto w-full text-xs text-muted sm:w-auto">{createMissingHint}</p>
            ) : null}
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={() => setCreateModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              disabled={saving || !createValid}
              onClick={() => {
                setCreateMode("create");
                setPendingCreateConfirm(true);
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={saving || !createValid}
              onClick={() => {
                setCreateMode("create_another");
                setPendingCreateConfirm(true);
              }}
            >
              {saving ? "Saving..." : "Save + Add Another"}
            </button>
          </>
        }
      >
        <SpendingEntryFields
          value={createForm}
          onChange={setCreateForm}
          categories={categories}
          types={types}
          staff={staff}
          disabled={saving}
        />
      </Modal>

      <Modal
        open={editModalOpen}
        onOpenChange={(open) => {
          if (!saving) {
            setEditModalOpen(open);
            if (!open) setEditingId(null);
          }
        }}
        title="Edit Spending Entry"
        size="xl"
        dismissible={!saving}
        closeOnBackdrop={!saving}
        onSubmitShortcut={
          saving || !editValid ? undefined : () => setPendingEditConfirm(true)
        }
        footer={
          <>
            {editMissingHint ? (
              <p className="mr-auto w-full text-xs text-muted sm:w-auto">{editMissingHint}</p>
            ) : null}
            <button
              type="button"
              className="btn-secondary"
              disabled={saving}
              onClick={() => {
                setEditModalOpen(false);
                setEditingId(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              disabled={saving || !editValid}
              onClick={() => setPendingEditConfirm(true)}
            >
              {saving ? "Saving..." : "Continue"}
            </button>
          </>
        }
      >
        <SpendingEntryFields
          value={editForm}
          onChange={setEditForm}
          categories={categories}
          types={types}
          staff={staff}
          disabled={saving}
        />
      </Modal>

      <ConfirmDialog
        open={pendingCreateConfirm}
        onOpenChange={setPendingCreateConfirm}
        title="Save spending entry?"
        description="Confirm you want to create this spending record."
        confirmLabel="Save"
        confirming={saving}
        closeOnBackdrop={false}
        onConfirm={() => void saveCreatedEntry()}
      />

      <ConfirmDialog
        open={pendingEditConfirm}
        onOpenChange={setPendingEditConfirm}
        title="Save spending entry changes?"
        description="Confirm you want to update this spending record."
        confirmLabel="Save changes"
        confirming={saving}
        closeOnBackdrop={false}
        onConfirm={() => void saveEditedEntry()}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteSubmitting) setPendingDelete(null);
        }}
        title="Delete transaction?"
        description={
          pendingDelete ? (
            <ul className="list-inside list-disc space-y-1 text-[rgb(var(--text-muted))]">
              <li>Date: {formatDateDisplay(pendingDelete.expense_date)}</li>
              <li>Cash flow: {directionLabel(pendingDelete.entry_direction)}</li>
              <li>
                Amount: {pendingDelete.currency_code}{" "}
                {formatAmount(Math.abs(pendingDelete.amount), {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 4
                })}
              </li>
              <li>
                {pendingDelete.category_name}
                {pendingDelete.description ? ` — ${pendingDelete.description}` : ""}
              </li>
              {pendingDelete.remarks ? (
                <li className="break-words">Remarks: {pendingDelete.remarks}</li>
              ) : null}
            </ul>
          ) : (
            "Delete this transaction?"
          )
        }
        confirmLabel="Delete"
        variant="danger"
        confirming={deleteSubmitting}
        closeOnBackdrop={false}
        onConfirm={() => void confirmDeleteExpense()}
      />
    </section>
  );
}
