"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExpenseCategory, ExpenseSubcategory } from "@/lib/types";
import { handleUnauthorizedResponse } from "@/lib/client/auth-fetch";

type Props = {
  categories: ExpenseCategory[];
  subcategories: ExpenseSubcategory[];
  defaultCategoryId?: string;
  submitLabel?: string;
};

type FormState = {
  expense_date: string;
  category_id: string;
  subcategory_id: string;
  amount: string;
  note: string;
  reference: string;
};

const today = new Date().toISOString().slice(0, 10);
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

export function TransactionForm({
  categories,
  subcategories,
  defaultCategoryId,
  submitLabel = "Save"
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newSubcategoryName, setNewSubcategoryName] = useState("");
  const [newSubcategoryCategoryId, setNewSubcategoryCategoryId] = useState(
    defaultCategoryId ?? categories[0]?.id ?? ""
  );
  const [creatingSubcategory, setCreatingSubcategory] = useState(false);
  const [form, setForm] = useState<FormState>({
    expense_date: today,
    category_id: defaultCategoryId ?? categories[0]?.id ?? "",
    subcategory_id: "",
    amount: "",
    note: "",
    reference: ""
  });

  const availableSubcategories = useMemo(
    () => subcategories.filter((item) => item.category_id === form.category_id && item.is_active),
    [form.category_id, subcategories]
  );

  async function handleSave(addAnother: boolean) {
    if (!form.expense_date) {
      setError("Date is required.");
      return;
    }
    if (!form.category_id) {
      setError("Category is required.");
      return;
    }
    if (!form.subcategory_id) {
      setError("Sub-category is required.");
      return;
    }
    const amountValue = Number(parseAmountInput(form.amount));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const response = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        amount: amountValue
      })
    });
    if (handleUnauthorizedResponse(response)) {
      setSaving(false);
      return;
    }
    const data = await response.json();

    if (!response.ok) {
      setSaving(false);
      setError(extractApiError(data.error, "Failed to save transaction."));
      return;
    }

    setSuccess("Transaction saved.");
    if (addAnother) {
      setForm((prev) => ({ ...prev, amount: "", note: "", reference: "" }));
    } else {
      setForm((prev) => ({ ...prev, amount: "" }));
    }
    setSaving(false);
    router.refresh();
  }

  async function handleCreateSubcategory() {
    if (!newSubcategoryName.trim() || !newSubcategoryCategoryId) return;
    setCreatingSubcategory(true);
    setError(null);

    const response = await fetch("/api/subcategories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category_id: newSubcategoryCategoryId,
        name: newSubcategoryName.trim()
      })
    });
    if (handleUnauthorizedResponse(response)) {
      setCreatingSubcategory(false);
      return;
    }
    const data = await response.json();
    setCreatingSubcategory(false);

    if (!response.ok) {
      setError(extractApiError(data.error, "Failed to create sub-category."));
      return;
    }

    setSuccess("Sub-category created.");
    setNewSubcategoryName("");
    setForm((prev) => ({
      ...prev,
      category_id: newSubcategoryCategoryId,
      subcategory_id: data.id
    }));
    router.refresh();
  }

  return (
    <section className="card">
      <h2 className="mb-3 text-lg font-semibold">Quick Add Transaction</h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm">
          Date *
          <input
            className="field mt-1"
            type="date"
            required
            value={form.expense_date}
            onChange={(event) => setForm((prev) => ({ ...prev, expense_date: event.target.value }))}
          />
        </label>
        <label className="text-sm">
          Category *
          <select
            className="field mt-1"
            required
            value={form.category_id}
            onChange={(event) =>
              setForm((prev) => ({
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
        </label>
        <label className="text-sm">
          Sub-category *
          <select
            className="field mt-1"
            required
            value={form.subcategory_id}
            onChange={(event) => setForm((prev) => ({ ...prev, subcategory_id: event.target.value }))}
          >
            <option value="">Select sub-category</option>
            {availableSubcategories.map((subcategory) => (
              <option key={subcategory.id} value={subcategory.id}>
                {subcategory.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Amount *
          <div className="mt-1 flex items-center rounded-md border border-slate-200 bg-white">
            <span className="px-3 text-sm text-slate-600">Rp</span>
            <input
              className="w-full rounded-r-md py-2 pr-3 text-sm outline-none"
              inputMode="numeric"
              required
              placeholder="0"
              value={form.amount}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, amount: formatAmountInput(event.target.value) }))
              }
            />
          </div>
        </label>
        <label className="text-sm">
          Note
          <input
            className="field mt-1"
            placeholder="Optional note"
            value={form.note}
            onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
          />
        </label>
        <label className="text-sm">
          Reference
          <input
            className="field mt-1"
            placeholder="Invoice / transfer ref"
            value={form.reference}
            onChange={(event) => setForm((prev) => ({ ...prev, reference: event.target.value }))}
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button className="btn" disabled={saving} onClick={() => handleSave(false)}>
          {saving ? "Saving..." : submitLabel}
        </button>
        <button className="btn-secondary" disabled={saving} onClick={() => handleSave(true)}>
          Save + Add Another
        </button>
      </div>

      <div className="mt-5 rounded-md border border-slate-200 p-4">
        <p className="text-sm font-medium">Create sub-category inline</p>
        <p className="mt-1 text-xs text-slate-600">
          Choose the target category for this new sub-category.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            className="field max-w-xs"
            value={newSubcategoryCategoryId}
            onChange={(event) => setNewSubcategoryCategoryId(event.target.value)}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <input
            className="field max-w-xs"
            placeholder="New sub-category name"
            value={newSubcategoryName}
            onChange={(event) => setNewSubcategoryName(event.target.value)}
          />
          <button className="btn-secondary" onClick={handleCreateSubcategory} disabled={creatingSubcategory}>
            {creatingSubcategory ? "Creating..." : "Create"}
          </button>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-600">{success}</p> : null}
    </section>
  );
}
