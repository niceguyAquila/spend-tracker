"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sliceForPage, useTablePagination } from "@/lib/table-pagination";
import { TablePaginationBar } from "@/components/ui/table-pagination-bar";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { SpendingCsvToolbar } from "@/components/spending-csv-toolbar";
import { formatAmountInput, parseAmountInput } from "@/components/big-book-entry-fields";
import { formatAmount, formatDateDisplay, getAmountColorClass } from "@/lib/display-format";

type Props = {
  rows: ExpenseWithNames[];
  categories: ExpenseCategory[];
  types: ExpenseType[];
  staff: ExpenseStaff[];
  activeMonth: string;
  monthOptions: string[];
  role: AppRole;
};

const CURRENCY_OPTIONS: SpendingCurrencyCode[] = ["IDR", "MYR", "USDT", "TRX"];

function extractApiError(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  if (error && typeof error === "object") {
    const maybeZod = error as { formErrors?: unknown; fieldErrors?: Record<string, unknown> };
    if (Array.isArray(maybeZod.formErrors)) {
      const formError = maybeZod.formErrors.find((item) => typeof item === "string" && item.trim().length > 0);
      if (typeof formError === "string") {
        return formError;
      }
    }
    if (maybeZod.fieldErrors && typeof maybeZod.fieldErrors === "object") {
      for (const value of Object.values(maybeZod.fieldErrors)) {
        if (Array.isArray(value)) {
          const fieldError = value.find((item) => typeof item === "string" && item.trim().length > 0);
          if (typeof fieldError === "string") {
            return fieldError;
          }
        }
      }
    }
  }
  return fallback;
}

type SortKey =
  | "expense_date"
  | "type_name"
  | "category_name"
  | "staff_name"
  | "currency_code"
  | "amount"
  | "entry_direction";
type SortDirection = "asc" | "desc";
type DirectionFilter = "" | "spending" | "profit";
type CurrencyFilter = "" | SpendingCurrencyCode;

function formatMonthLabel(monthKey: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(`${monthKey}T00:00:00`)
  );
}

type EditDraft = {
  expense_date: string;
  entry_direction: "spending" | "profit";
  type_id: string;
  category_id: string;
  description: string;
  staff_id: string;
  currency_code: SpendingCurrencyCode;
  amount: string;
  remarks: string;
};

function signedExpenseAmount(row: Pick<ExpenseWithNames, "amount" | "entry_direction">) {
  const amount = Math.abs(Number(row.amount));
  return row.entry_direction === "profit" ? amount : -amount;
}

function directionLabel(direction: "spending" | "profit") {
  return direction === "profit" ? "In" : "Out";
}

function sortValue(row: ExpenseWithNames, key: SortKey) {
  if (key === "type_name") return row.type_name ?? "";
  if (key === "staff_name") return row.staff_name ?? "";
  return String(row[key] ?? "");
}

function isEditDraftDirty(row: ExpenseWithNames, draft: EditDraft) {
  const draftAmount = Number(parseAmountInput(draft.amount));
  if (!Number.isFinite(draftAmount) || draftAmount !== row.amount) return true;
  if (draft.expense_date !== row.expense_date) return true;
  if (draft.entry_direction !== row.entry_direction) return true;
  if (draft.category_id !== row.category_id) return true;
  if ((draft.type_id || null) !== row.type_id) return true;
  if ((draft.staff_id || null) !== row.staff_id) return true;
  if (draft.currency_code !== row.currency_code) return true;
  if ((draft.description ?? "") !== (row.description ?? "")) return true;
  if ((draft.remarks ?? "") !== (row.remarks ?? "")) return true;
  return false;
}

export function TransactionTable({ rows, categories, types, staff, activeMonth, monthOptions, role }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("");
  const [sortKey, setSortKey] = useState<SortKey>("expense_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ExpenseWithNames | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const criticalPending = saving || deleteSubmitting;

  const [draft, setDraft] = useState<EditDraft>({
    expense_date: "",
    entry_direction: "spending",
    type_id: "",
    category_id: "",
    description: "",
    staff_id: "",
    currency_code: "IDR",
    amount: "",
    remarks: ""
  });

  const filteredRows = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    const baseRows = rows.filter((row) => {
      if (normalized) {
        const matchesQuery = [
          row.description ?? "",
          row.remarks ?? "",
          row.type_name ?? "",
          row.category_name,
          row.staff_name ?? ""
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
        if (!matchesQuery) return false;
      }
      if (dateFrom && row.expense_date < dateFrom) return false;
      if (dateTo && row.expense_date > dateTo) return false;
      if (categoryFilter && row.category_id !== categoryFilter) return false;
      if (typeFilter && row.type_id !== typeFilter) return false;
      if (staffFilter && row.staff_id !== staffFilter) return false;
      if (currencyFilter && row.currency_code !== currencyFilter) return false;
      if (directionFilter && row.entry_direction !== directionFilter) return false;
      return true;
    });

    return baseRows.sort((a, b) => {
      if (sortKey === "amount") {
        const left = signedExpenseAmount(a);
        const right = signedExpenseAmount(b);
        return sortDirection === "asc" ? left - right : right - left;
      }
      const left = sortValue(a, sortKey);
      const right = sortValue(b, sortKey);
      const compared = left.localeCompare(right);
      return sortDirection === "asc" ? compared : -compared;
    });
  }, [
    query,
    rows,
    dateFrom,
    dateTo,
    categoryFilter,
    typeFilter,
    staffFilter,
    currencyFilter,
    directionFilter,
    sortKey,
    sortDirection
  ]);

  const pagination = useTablePagination(filteredRows.length);
  const pagedRows = useMemo(
    () => sliceForPage(filteredRows, pagination.page, pagination.pageSize),
    [filteredRows, pagination.page, pagination.pageSize]
  );

  const { setPage } = pagination;
  useEffect(() => {
    setPage(0);
  }, [
    query,
    dateFrom,
    dateTo,
    categoryFilter,
    typeFilter,
    staffFilter,
    currencyFilter,
    directionFilter,
    sortKey,
    sortDirection,
    setPage
  ]);

  function updateMonth(monthKey: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", monthKey);
    const nextSearch = params.toString();
    router.push(nextSearch ? `${pathname}?${nextSearch}` : pathname);
  }

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    if (nextKey === "expense_date" || nextKey === "amount") {
      setSortDirection("desc");
      return;
    }
    setSortDirection("asc");
  }

  function directionSelect(
    value: "spending" | "profit",
    onChange: (value: "spending" | "profit") => void,
    disabled?: boolean
  ) {
    return (
      <select
        className="field"
        required
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value as "spending" | "profit")}
      >
        <option value="spending">Out</option>
        <option value="profit">In</option>
      </select>
    );
  }

  function renderSortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return sortDirection === "asc" ? " ↑" : " ↓";
  }

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!openActionMenuId) return;
      if (actionMenuRef.current && event.target instanceof Node && !actionMenuRef.current.contains(event.target)) {
        setOpenActionMenuId(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenActionMenuId(null);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openActionMenuId]);

  function startEdit(row: ExpenseWithNames) {
    setOpenActionMenuId(null);
    setEditingId(row.id);
    setDraft({
      expense_date: row.expense_date,
      entry_direction: row.entry_direction,
      type_id: row.type_id ?? "",
      category_id: row.category_id,
      description: row.description ?? "",
      staff_id: row.staff_id ?? "",
      currency_code: row.currency_code,
      amount: formatAmountInput(String(row.amount)),
      remarks: row.remarks ?? ""
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!draft.expense_date || !draft.category_id) {
      setMessage("Date and category are required.");
      return;
    }
    const amountValue = Number(parseAmountInput(draft.amount));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setMessage("Amount must be greater than 0.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await secureFetch("/api/expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          expense_date: draft.expense_date,
          entry_direction: draft.entry_direction,
          currency_code: draft.currency_code,
          category_id: draft.category_id,
          type_id: draft.type_id || null,
          staff_id: draft.staff_id || null,
          amount: amountValue,
          description: draft.description,
          remarks: draft.remarks
        })
      });
      if (handleUnauthorizedResponse(response)) {
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setMessage(extractApiError(data.error, "Failed to update transaction."));
        return;
      }
      setMessage("Transaction updated.");
      setEditingId(null);
      router.refresh();
    } catch {
      setMessage("Failed to update transaction due to a network error.");
    } finally {
      setSaving(false);
    }
  }

  function requestCancelEdit() {
    const row = rows.find((r) => r.id === editingId);
    if (!row || !isEditDraftDirty(row, draft)) {
      setEditingId(null);
      return;
    }
    setDiscardOpen(true);
  }

  function confirmDiscardEdit() {
    setDiscardOpen(false);
    setEditingId(null);
  }

  function openDeleteDialog(row: ExpenseWithNames) {
    setOpenActionMenuId(null);
    setPendingDelete(row);
  }

  async function confirmDeleteExpense() {
    if (!pendingDelete) return;
    setDeleteSubmitting(true);
    setMessage(null);
    try {
      const response = await secureFetch(`/api/expenses?id=${pendingDelete.id}`, { method: "DELETE" });
      if (handleUnauthorizedResponse(response)) {
        setPendingDelete(null);
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Failed to delete transaction.");
        setPendingDelete(null);
        return;
      }
      setMessage("Transaction deleted.");
      setPendingDelete(null);
      router.refresh();
    } catch {
      setMessage("Failed to delete transaction due to a network error.");
      setPendingDelete(null);
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <section className="card relative" aria-busy={criticalPending}>
      <BlockingOverlay active={criticalPending} label={saving ? "Saving transaction..." : "Deleting transaction..."} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Transaction Ledger</h2>
        <div className="flex flex-wrap items-center gap-2">
          <SpendingCsvToolbar
            role={role}
            disabled={criticalPending}
            filters={{
              month: activeMonth,
              dateFrom,
              dateTo,
              query,
              direction: directionFilter,
              categoryId: categoryFilter,
              typeId: typeFilter,
              staffId: staffFilter,
              currency: currencyFilter
            }}
          />
          <input
            className="field max-w-xs"
            placeholder="Search description, remarks..."
            value={query}
            disabled={criticalPending}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <label className="text-sm text-[rgb(var(--text-muted))]">
          <span className="mb-1 block">Month</span>
          <select
            className="field"
            value={activeMonth}
            disabled={criticalPending}
            onChange={(event) => updateMonth(event.target.value)}
          >
            {monthOptions.map((monthKey) => (
              <option key={monthKey} value={monthKey}>
                {formatMonthLabel(monthKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[rgb(var(--text-muted))]">
          <span className="mb-1 block">Date from</span>
          <input
            className="field"
            type="date"
            value={dateFrom}
            disabled={criticalPending}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </label>
        <label className="text-sm text-[rgb(var(--text-muted))]">
          <span className="mb-1 block">Date to</span>
          <input
            className="field"
            type="date"
            value={dateTo}
            disabled={criticalPending}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </label>
        <label className="text-sm text-[rgb(var(--text-muted))]">
          <span className="mb-1 block">Cash flow</span>
          <select
            className="field"
            value={directionFilter}
            disabled={criticalPending}
            onChange={(event) => setDirectionFilter(event.target.value as DirectionFilter)}
          >
            <option value="">All</option>
            <option value="spending">Out</option>
            <option value="profit">In</option>
          </select>
        </label>
        <label className="text-sm text-[rgb(var(--text-muted))]">
          <span className="mb-1 block">Type</span>
          <select
            className="field"
            value={typeFilter}
            disabled={criticalPending}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="">All types</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[rgb(var(--text-muted))]">
          <span className="mb-1 block">Category</span>
          <select
            className="field"
            value={categoryFilter}
            disabled={criticalPending}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[rgb(var(--text-muted))]">
          <span className="mb-1 block">Staff</span>
          <select
            className="field"
            value={staffFilter}
            disabled={criticalPending}
            onChange={(event) => setStaffFilter(event.target.value)}
          >
            <option value="">All staff</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[rgb(var(--text-muted))]">
          <span className="mb-1 block">Currency</span>
          <select
            className="field"
            value={currencyFilter}
            disabled={criticalPending}
            onChange={(event) => setCurrencyFilter(event.target.value as CurrencyFilter)}
          >
            <option value="">All currencies</option>
            {CURRENCY_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table data-table-zebra min-w-[1400px]">
          <thead>
            <tr>
              <th className="px-3 py-2">
                <button className="font-medium" disabled={criticalPending} onClick={() => toggleSort("expense_date")}>
                  Date{renderSortIndicator("expense_date")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button className="font-medium" disabled={criticalPending} onClick={() => toggleSort("type_name")}>
                  Type{renderSortIndicator("type_name")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button className="font-medium" disabled={criticalPending} onClick={() => toggleSort("category_name")}>
                  Category{renderSortIndicator("category_name")}
                </button>
              </th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">
                <button className="font-medium" disabled={criticalPending} onClick={() => toggleSort("staff_name")}>
                  Staff{renderSortIndicator("staff_name")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button className="font-medium" disabled={criticalPending} onClick={() => toggleSort("currency_code")}>
                  Currency{renderSortIndicator("currency_code")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button className="font-medium" disabled={criticalPending} onClick={() => toggleSort("amount")}>
                  Amount{renderSortIndicator("amount")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button className="font-medium" disabled={criticalPending} onClick={() => toggleSort("entry_direction")}>
                  Cash flow{renderSortIndicator("entry_direction")}
                </button>
              </th>
              <th className="px-3 py-2">Remarks</th>
              <th className="px-3 py-2">Created By</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row) => {
              const isEditing = editingId === row.id;
              const signedAmount = signedExpenseAmount(row);
              return (
                <tr key={row.id}>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        className="field"
                        type="date"
                        required
                        value={draft.expense_date}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, expense_date: event.target.value }))
                        }
                      />
                    ) : (
                      formatDateDisplay(row.expense_date)
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <select
                        className="field"
                        value={draft.type_id}
                        onChange={(event) => setDraft((prev) => ({ ...prev, type_id: event.target.value }))}
                      >
                        <option value="">None</option>
                        {types.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name}
                          </option>
                        ))}
                      </select>
                    ) : row.type_name ? (
                      row.type_name
                    ) : (
                      <span className="text-xs text-muted">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <select
                        className="field"
                        required
                        value={draft.category_id}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            category_id: event.target.value
                          }))
                        }
                      >
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.category_name
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        className="field"
                        value={draft.description}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, description: event.target.value }))
                        }
                      />
                    ) : row.description ? (
                      row.description
                    ) : (
                      <span className="text-xs text-muted">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <select
                        className="field"
                        value={draft.staff_id}
                        onChange={(event) => setDraft((prev) => ({ ...prev, staff_id: event.target.value }))}
                      >
                        <option value="">None</option>
                        {staff.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    ) : row.staff_name ? (
                      row.staff_name
                    ) : (
                      <span className="text-xs text-muted">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <select
                        className="field"
                        required
                        value={draft.currency_code}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            currency_code: event.target.value as SpendingCurrencyCode
                          }))
                        }
                      >
                        {CURRENCY_OPTIONS.map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.currency_code
                    )}
                  </td>
                  <td className="overflow-hidden px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {isEditing ? (
                      <div className="flex items-center rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
                        <span className="px-2 text-xs text-[rgb(var(--text-muted))]">{draft.currency_code}</span>
                        <input
                          className="w-28 py-2 pr-2 text-sm outline-none"
                          inputMode="decimal"
                          required
                          value={draft.amount}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, amount: formatAmountInput(event.target.value) }))
                          }
                        />
                      </div>
                    ) : (
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
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing
                      ? directionSelect(draft.entry_direction, (entry_direction) =>
                          setDraft((prev) => ({ ...prev, entry_direction }))
                        )
                      : directionLabel(row.entry_direction)}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        className="field"
                        value={draft.remarks}
                        onChange={(event) => setDraft((prev) => ({ ...prev, remarks: event.target.value }))}
                      />
                    ) : row.remarks ? (
                      row.remarks
                    ) : (
                      <span className="text-xs text-muted">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{row.creator_display_name}</td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <button className="btn-secondary" disabled={saving} onClick={() => void saveEdit()}>
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button className="btn-secondary" disabled={saving} onClick={requestCancelEdit}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="relative" ref={openActionMenuId === row.id ? actionMenuRef : null}>
                        <button
                          className="btn-secondary btn-sm"
                          aria-label="Open actions menu"
                          aria-expanded={openActionMenuId === row.id}
                          aria-haspopup="menu"
                          onClick={() =>
                            setOpenActionMenuId((prev) => (prev === row.id ? null : row.id))
                          }
                          disabled={criticalPending}
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 16 16"
                            className="h-4 w-4"
                            fill="currentColor"
                          >
                            <circle cx="8" cy="3" r="1.25" />
                            <circle cx="8" cy="8" r="1.25" />
                            <circle cx="8" cy="13" r="1.25" />
                          </svg>
                        </button>
                        {openActionMenuId === row.id ? (
                          <div
                            role="menu"
                            className="absolute right-0 z-10 mt-1 w-28 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1 shadow-sm"
                          >
                            <button
                              className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-[rgb(var(--surface-muted))]"
                              role="menuitem"
                              onClick={() => startEdit(row)}
                            >
                              Edit
                            </button>
                            <button
                              className="block w-full rounded px-2 py-1 text-left text-sm text-[rgb(var(--danger))] hover:bg-[rgb(var(--danger)/0.12)]"
                              role="menuitem"
                              onClick={() => openDeleteDialog(row)}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!filteredRows.length ? (
              <TableEmptyState colSpan={11} message="No transactions found for the selected month and filters." />
            ) : null}
          </tbody>
        </table>
      </div>
      <TablePaginationBar
        totalCount={filteredRows.length}
        page={pagination.page}
        setPage={pagination.setPage}
        pageSize={pagination.pageSize}
        setPageSize={pagination.setPageSize}
        pageCount={pagination.pageCount}
        rangeLabel={pagination.rangeLabel}
      />
      {message ? (
        <p className="mt-3 text-sm text-[rgb(var(--text-muted))]" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteSubmitting) setPendingDelete(null);
        }}
        title="Delete transaction?"
        variant="danger"
        closeOnBackdrop={false}
        confirming={deleteSubmitting}
        confirmLabel="Delete"
        onConfirm={confirmDeleteExpense}
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
          ) : null
        }
      />

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard changes?"
        description="You have unsaved edits to this row. Discard them and return to view mode?"
        confirmLabel="Discard"
        variant="danger"
        closeOnBackdrop={false}
        onConfirm={() => {
          confirmDiscardEdit();
        }}
      />
    </section>
  );
}
