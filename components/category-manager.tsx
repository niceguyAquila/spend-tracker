"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExpenseCategory, ExpenseSubcategory } from "@/lib/types";
import { handleUnauthorizedResponse } from "@/lib/client/auth-fetch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PromptDialog } from "@/components/ui/prompt-dialog";

export function CategoryManager({
  categories,
  subcategories
}: {
  categories: ExpenseCategory[];
  subcategories: ExpenseSubcategory[];
}) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryCode, setNewCategoryCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [disableTarget, setDisableTarget] = useState<ExpenseSubcategory | null>(null);
  const [disableSubmitting, setDisableSubmitting] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [toggleSubmittingId, setToggleSubmittingId] = useState<string | null>(null);
  const [categoryRenameTarget, setCategoryRenameTarget] = useState<ExpenseCategory | null>(null);
  const [categoryRenameSubmitting, setCategoryRenameSubmitting] = useState(false);
  const [categoryToggleSubmittingId, setCategoryToggleSubmittingId] = useState<string | null>(null);

  const currentRows = useMemo(
    () => subcategories.filter((item) => item.category_id === selectedCategory),
    [selectedCategory, subcategories]
  );

  async function createSubcategory() {
    if (!selectedCategory || newName.trim().length < 2 || creating) return;
    setCreating(true);
    setMessage(null);
    const response = await fetch("/api/subcategories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category_id: selectedCategory,
        name: newName.trim()
      })
    });
    if (handleUnauthorizedResponse(response)) {
      setCreating(false);
      return;
    }
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Failed to create sub-category.");
      setCreating(false);
      return;
    }
    setMessage("Sub-category added.");
    setNewName("");
    setCreating(false);
    router.refresh();
  }

  async function createCategory() {
    if (creatingCategory) return;
    const name = newCategoryName.trim();
    const code = newCategoryCode.trim().toUpperCase();
    if (name.length < 2 || code.length < 2) return;

    setCreatingCategory(true);
    setMessage(null);
    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, code })
    });
    if (handleUnauthorizedResponse(response)) {
      setCreatingCategory(false);
      return;
    }
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Failed to create category.");
      setCreatingCategory(false);
      return;
    }
    setMessage("Category added.");
    setNewCategoryName("");
    setNewCategoryCode("");
    setCreatingCategory(false);
    router.refresh();
  }

  async function submitRename(next: string) {
    if (!renameTarget) return;
    setRenameSubmitting(true);
    setMessage(null);
    const response = await fetch("/api/subcategories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: renameTarget.id, name: next })
    });
    if (handleUnauthorizedResponse(response)) {
      setRenameSubmitting(false);
      setRenameTarget(null);
      return;
    }
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Rename failed.");
      setRenameSubmitting(false);
      return;
    }
    setMessage("Sub-category renamed.");
    setRenameSubmitting(false);
    setRenameTarget(null);
    router.refresh();
  }

  async function confirmDisableSubcategory() {
    if (!disableTarget || !disableTarget.is_active) return;
    setDisableSubmitting(true);
    setMessage(null);
    const response = await fetch("/api/subcategories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: disableTarget.id, is_active: false })
    });
    if (handleUnauthorizedResponse(response)) {
      setDisableSubmitting(false);
      setDisableTarget(null);
      return;
    }
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Update failed.");
      setDisableSubmitting(false);
      setDisableTarget(null);
      return;
    }
    setMessage("Sub-category disabled.");
    setDisableSubmitting(false);
    setDisableTarget(null);
    router.refresh();
  }

  async function toggleActive(id: string, isActive: boolean) {
    if (toggleSubmittingId) return;
    setToggleSubmittingId(id);
    setMessage(null);
    const response = await fetch("/api/subcategories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: !isActive })
    });
    if (handleUnauthorizedResponse(response)) {
      setToggleSubmittingId(null);
      return;
    }
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Update failed.");
      setToggleSubmittingId(null);
      return;
    }
    setMessage(!isActive ? "Sub-category enabled." : "Sub-category disabled.");
    setToggleSubmittingId(null);
    router.refresh();
  }

  async function submitCategoryRename(next: string) {
    if (!categoryRenameTarget) return;
    setCategoryRenameSubmitting(true);
    setMessage(null);
    const response = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: categoryRenameTarget.id, name: next })
    });
    if (handleUnauthorizedResponse(response)) {
      setCategoryRenameSubmitting(false);
      setCategoryRenameTarget(null);
      return;
    }
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Category rename failed.");
      setCategoryRenameSubmitting(false);
      return;
    }
    setMessage("Category renamed.");
    setCategoryRenameSubmitting(false);
    setCategoryRenameTarget(null);
    router.refresh();
  }

  async function toggleCategoryActive(id: string, isActive: boolean) {
    if (categoryToggleSubmittingId) return;
    setCategoryToggleSubmittingId(id);
    setMessage(null);
    const response = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: !isActive })
    });
    if (handleUnauthorizedResponse(response)) {
      setCategoryToggleSubmittingId(null);
      return;
    }
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Category update failed.");
      setCategoryToggleSubmittingId(null);
      return;
    }
    setMessage(!isActive ? "Category enabled." : "Category disabled.");
    setCategoryToggleSubmittingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Main Category Manager</h2>
        <p className="mb-4 text-sm text-slate-600">
          Categories are now brand-specific. You can create, rename, enable, or disable categories for the active brand.
        </p>

        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <input
            className="field"
            placeholder="Category code (e.g. OFFICE_COST)"
            value={newCategoryCode}
            onChange={(event) => setNewCategoryCode(event.target.value.toUpperCase())}
          />
          <input
            className="field"
            placeholder="Category name"
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
          />
          <button className="btn-secondary" disabled={creatingCategory} onClick={() => void createCategory()}>
            {creatingCategory ? "Adding…" : "Add Category"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="px-3 py-2">{item.code}</td>
                  <td className="px-3 py-2">{item.name}</td>
                  <td className="px-3 py-2">{item.is_active ? "Active" : "Disabled"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn-secondary"
                        disabled={Boolean(categoryToggleSubmittingId) || categoryRenameSubmitting}
                        onClick={() => setCategoryRenameTarget(item)}
                      >
                        Rename
                      </button>
                      <button
                        className="btn-secondary"
                        disabled={Boolean(categoryToggleSubmittingId) || categoryRenameSubmitting}
                        onClick={() => void toggleCategoryActive(item.id, item.is_active)}
                      >
                        {categoryToggleSubmittingId === item.id
                          ? "Updating…"
                          : item.is_active
                            ? "Disable"
                            : "Enable"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Sub-category Manager</h2>
        <div className="mb-3">
          <label className="text-sm">
            Category
            <select
              className="field mt-1 max-w-sm"
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
            >
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <input
            className="field max-w-sm"
            placeholder="New sub-category name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <button className="btn-secondary" disabled={creating} onClick={() => void createSubcategory()}>
            {creating ? "Adding…" : "Add"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{row.is_active ? "Active" : "Disabled"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn-secondary"
                        disabled={Boolean(toggleSubmittingId) || renameSubmitting}
                        onClick={() => setRenameTarget({ id: row.id, name: row.name })}
                      >
                        Rename
                      </button>
                      {row.is_active ? (
                        <button
                          className="btn-secondary"
                          disabled={Boolean(toggleSubmittingId) || renameSubmitting}
                          onClick={() => setDisableTarget(row)}
                        >
                          Disable
                        </button>
                      ) : (
                        <button
                          className="btn-secondary"
                          disabled={Boolean(toggleSubmittingId) || renameSubmitting}
                          onClick={() => void toggleActive(row.id, row.is_active)}
                        >
                          {toggleSubmittingId === row.id ? "Updating…" : "Enable"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Guardrails</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Use disable instead of deleting sub-categories tied to historical transactions.</li>
          <li>Rename keeps historical rows intact while improving naming consistency.</li>
          <li>RLS policies enforce least-privilege access for write operations.</li>
        </ul>
      </section>

      {message ? (
        <p className="text-sm text-slate-700" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}

      <ConfirmDialog
        open={Boolean(disableTarget)}
        onOpenChange={(open) => {
          if (!open && !disableSubmitting) setDisableTarget(null);
        }}
        title="Disable sub-category?"
        variant="danger"
        closeOnBackdrop={false}
        confirming={disableSubmitting}
        confirmLabel="Disable"
        description={
          disableTarget ? (
            <div className="space-y-2">
              <p>
                <span className="font-medium text-slate-900">{disableTarget.name}</span> will be hidden from category
                pickers when adding or editing transactions. Existing transactions stay unchanged.
              </p>
            </div>
          ) : null
        }
        onConfirm={() => void confirmDisableSubcategory()}
      />

      <PromptDialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open && !renameSubmitting) setRenameTarget(null);
        }}
        title="Rename sub-category"
        label="Name"
        initialValue={renameTarget?.name ?? ""}
        submitting={renameSubmitting}
        onConfirm={(value) => void submitRename(value)}
      />

      <PromptDialog
        open={Boolean(categoryRenameTarget)}
        onOpenChange={(open) => {
          if (!open && !categoryRenameSubmitting) setCategoryRenameTarget(null);
        }}
        title="Rename category"
        label="Name"
        initialValue={categoryRenameTarget?.name ?? ""}
        submitting={categoryRenameSubmitting}
        onConfirm={(value) => void submitCategoryRename(value)}
      />
    </div>
  );
}
