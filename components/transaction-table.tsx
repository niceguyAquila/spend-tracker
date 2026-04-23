"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ExpenseCategory, ExpenseSubcategory, ExpenseWithNames } from "@/lib/types";
import { handleUnauthorizedResponse } from "@/lib/client/auth-fetch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BlockingOverlay } from "@/components/ui/blocking-overlay";

type Props = {
  rows: ExpenseWithNames[];
  categories: ExpenseCategory[];
  subcategories: ExpenseSubcategory[];
  activeMonth: string;
  monthOptions: string[];
};

const currencyFormatter = new Intl.NumberFormat("id-ID");

function parseAmountInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function formatAmountInput(value: string) {
  const parsed = parseAmountInput(value);
  if (!parsed) return "";
  return currencyFormatter.format(Number(parsed));
}

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

type SortKey = "expense_date" | "category_name" | "subcategory_name" | "amount";
type SortDirection = "asc" | "desc";

function formatMonthLabel(monthKey: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(`${monthKey}T00:00:00`)
  );
}

type EditDraft = {
  expense_date: string;
  category_id: string;
  subcategory_id: string;
  amount: string;
  note: string;
  reference: string;
};

function isEditDraftDirty(row: ExpenseWithNames, draft: EditDraft) {
  const draftAmount = Number(parseAmountInput(draft.amount));
  if (!Number.isFinite(draftAmount) || draftAmount !== row.amount) return true;
  if (draft.expense_date !== row.expense_date) return true;
  if (draft.category_id !== row.category_id) return true;
  if (draft.subcategory_id !== row.subcategory_id) return true;
  if ((draft.note ?? "") !== (row.note ?? "")) return true;
  if ((draft.reference ?? "") !== (row.reference ?? "")) return true;
  return false;
}

export function TransactionTable({ rows, categories, subcategories, activeMonth, monthOptions }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subcategoryFilter, setSubcategoryFilter] = useState("");
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

  const [draft, setDraft] = useState<{
    expense_date: string;
    category_id: string;
    subcategory_id: string;
    amount: string;
    note: string;
    reference: string;
  }>({
    expense_date: "",
    category_id: "",
    subcategory_id: "",
    amount: "",
    note: "",
    reference: ""
  });

  const subcategoryFilterOptions = useMemo(() => {
    if (!categoryFilter) return subcategories;
    return subcategories.filter((item) => item.category_id === categoryFilter);
  }, [categoryFilter, subcategories]);

  const filteredRows = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    const baseRows = rows.filter((row) => {
      if (normalized) {
        const matchesQuery = [row.category_name, row.subcategory_name, row.note ?? "", row.reference ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
        if (!matchesQuery) return false;
      }
      if (dateFrom && row.expense_date < dateFrom) return false;
      if (dateTo && row.expense_date > dateTo) return false;
      if (categoryFilter && row.category_id !== categoryFilter) return false;
      if (subcategoryFilter && row.subcategory_id !== subcategoryFilter) return false;
      return true;
    });

    return baseRows.sort((a, b) => {
      if (sortKey === "amount") {
        const left = a.amount;
        const right = b.amount;
        return sortDirection === "asc" ? left - right : right - left;
      }
      const left = a[sortKey];
      const right = b[sortKey];
      const compared = left.localeCompare(right);
      return sortDirection === "asc" ? compared : -compared;
    });
  }, [query, rows, dateFrom, dateTo, categoryFilter, subcategoryFilter, sortKey, sortDirection]);

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
      category_id: row.category_id,
      subcategory_id: row.subcategory_id,
      amount: formatAmountInput(String(row.amount)),
      note: row.note ?? "",
      reference: row.reference ?? ""
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!draft.expense_date || !draft.category_id || !draft.subcategory_id) {
      setMessage("Date, category, and sub-category are required.");
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
      const response = await fetch("/api/expenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          ...draft,
          amount: amountValue
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
      const response = await fetch(`/api/expenses?id=${pendingDelete.id}`, { method: "DELETE" });
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Transaction Ledger</h2>
        <input
          className="field max-w-xs"
          placeholder="Search note, category..."
          value={query}
          disabled={criticalPending}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-5">
        <label className="text-sm text-slate-700">
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
        <label className="text-sm text-slate-700">
          <span className="mb-1 block">Date from</span>
          <input
            className="field"
            type="date"
            value={dateFrom}
            disabled={criticalPending}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block">Date to</span>
          <input
            className="field"
            type="date"
            value={dateTo}
            disabled={criticalPending}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block">Category</span>
          <select
            className="field"
            value={categoryFilter}
            disabled={criticalPending}
            onChange={(event) => {
              setCategoryFilter(event.target.value);
              setSubcategoryFilter("");
            }}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          <span className="mb-1 block">Sub-category</span>
          <select
            className="field"
            value={subcategoryFilter}
            disabled={criticalPending}
            onChange={(event) => setSubcategoryFilter(event.target.value)}
          >
            <option value="">All sub-categories</option>
            {subcategoryFilterOptions.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1040px] text-sm">
          <thead className="border-b bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">
                <button className="font-medium" disabled={criticalPending} onClick={() => toggleSort("expense_date")}>
                  Date{renderSortIndicator("expense_date")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button className="font-medium" disabled={criticalPending} onClick={() => toggleSort("category_name")}>
                  Category{renderSortIndicator("category_name")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button className="font-medium" disabled={criticalPending} onClick={() => toggleSort("subcategory_name")}>
                  Sub-category{renderSortIndicator("subcategory_name")}
                </button>
              </th>
              <th className="px-3 py-2">
                <button className="font-medium" disabled={criticalPending} onClick={() => toggleSort("amount")}>
                  Amount{renderSortIndicator("amount")}
                </button>
              </th>
              <th className="px-3 py-2">Note</th>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2">Created By</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const isEditing = editingId === row.id;
              const allowedSubs = subcategories.filter((item) => item.category_id === draft.category_id);
              return (
                <tr key={row.id} className="border-b">
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
                      row.expense_date
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
                            category_id: event.target.value,
                            subcategory_id: ""
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
                      <select
                        className="field"
                        required
                        value={draft.subcategory_id}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, subcategory_id: event.target.value }))
                        }
                      >
                        <option value="">Select</option>
                        {allowedSubs.map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.subcategory_name
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <div className="flex items-center rounded-md border border-slate-200 bg-white">
                        <span className="px-2 text-xs text-slate-600">Rp</span>
                        <input
                          className="w-28 py-2 pr-2 text-sm outline-none"
                          inputMode="numeric"
                          required
                          value={draft.amount}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, amount: formatAmountInput(event.target.value) }))
                          }
                        />
                      </div>
                    ) : (
                      `Rp ${row.amount.toLocaleString("id-ID")}`
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        className="field"
                        value={draft.note}
                        onChange={(event) => setDraft((prev) => ({ ...prev, note: event.target.value }))}
                      />
                    ) : (
                      row.note
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        className="field"
                        value={draft.reference}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, reference: event.target.value }))
                        }
                      />
                    ) : (
                      row.reference
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
                            className="absolute right-0 z-10 mt-1 w-28 rounded-md border border-slate-200 bg-white p-1 shadow-sm"
                          >
                            <button
                              className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100"
                              role="menuitem"
                              onClick={() => startEdit(row)}
                            >
                              Edit
                            </button>
                            <button
                              className="block w-full rounded px-2 py-1 text-left text-sm text-red-600 hover:bg-slate-100"
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
              <tr>
                <td className="px-3 py-4 text-center text-slate-600" colSpan={8}>
                  No transactions found for the selected month and filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {message ? (
        <p className="mt-3 text-sm text-slate-700" role="status" aria-live="polite">
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
            <ul className="list-inside list-disc space-y-1 text-slate-700">
              <li>Date: {pendingDelete.expense_date}</li>
              <li>
                Amount: Rp {pendingDelete.amount.toLocaleString("id-ID")}
              </li>
              <li>
                {pendingDelete.category_name} — {pendingDelete.subcategory_name}
              </li>
              {(pendingDelete.note ?? pendingDelete.reference) ? (
                <li className="break-words">
                  {pendingDelete.note ? `Note: ${pendingDelete.note}` : null}
                  {pendingDelete.note && pendingDelete.reference ? " · " : null}
                  {pendingDelete.reference ? `Ref: ${pendingDelete.reference}` : null}
                </li>
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
