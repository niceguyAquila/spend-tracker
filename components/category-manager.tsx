"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sliceForPage, useTablePagination } from "@/lib/table-pagination";
import { TablePaginationBar } from "@/components/ui/table-pagination-bar";
import { TableEmptyState } from "@/components/ui/table-empty-state";
import { BlockingOverlay } from "@/components/ui/blocking-overlay";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import { EntityEditDialog } from "@/components/ui/entity-edit-dialog";
import type { ExpenseCategory, ExpenseStaff, ExpenseType } from "@/lib/types";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import { ENTITY_CODE_HINT, ENTITY_CODE_MAX_LENGTH, normalizeEntityCode } from "@/lib/entity-code";
import { useEntityEditor, type EditableEntity, type EntityEditor } from "@/lib/entity-editor";

type StatusFilter = "all" | "active" | "inactive";

type Props = {
  categories: ExpenseCategory[];
  types: ExpenseType[];
  staff: ExpenseStaff[];
};

type ApiErrorShape = {
  formErrors?: unknown;
  fieldErrors?: Record<string, unknown>;
};

function extractApiError(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim().length > 0) return error;
  if (error && typeof error === "object") {
    const maybeZod = error as ApiErrorShape;
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

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
        active
          ? "bg-[rgb(var(--success)/0.15)] text-[rgb(var(--success))]"
          : "bg-[rgb(var(--surface-muted))] text-muted"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function CategoryManager({ categories, types, staff }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryCode, setNewCategoryCode] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryRenameTarget, setCategoryRenameTarget] = useState<ExpenseCategory | null>(null);
  const [categoryRenameSubmitting, setCategoryRenameSubmitting] = useState(false);
  const [categoryToggleSubmittingId, setCategoryToggleSubmittingId] = useState<string | null>(null);

  const [newTypeCode, setNewTypeCode] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const [pendingAddTypeConfirm, setPendingAddTypeConfirm] = useState(false);
  const [typeSubmitting, setTypeSubmitting] = useState(false);
  const [pendingToggleType, setPendingToggleType] = useState<ExpenseType | null>(null);
  const [toggleTypeSubmitting, setToggleTypeSubmitting] = useState(false);
  const [pendingDeleteType, setPendingDeleteType] = useState<ExpenseType | null>(null);
  const [typeDeleting, setTypeDeleting] = useState(false);
  const [typeQuery, setTypeQuery] = useState("");
  const [typeStatusFilter, setTypeStatusFilter] = useState<StatusFilter>("all");

  const [newStaffCode, setNewStaffCode] = useState("");
  const [newStaffName, setNewStaffName] = useState("");
  const [pendingAddStaffConfirm, setPendingAddStaffConfirm] = useState(false);
  const [staffSubmitting, setStaffSubmitting] = useState(false);
  const [pendingToggleStaff, setPendingToggleStaff] = useState<ExpenseStaff | null>(null);
  const [toggleStaffSubmitting, setToggleStaffSubmitting] = useState(false);
  const [pendingDeleteStaff, setPendingDeleteStaff] = useState<ExpenseStaff | null>(null);
  const [staffDeleting, setStaffDeleting] = useState(false);
  const [staffQuery, setStaffQuery] = useState("");
  const [staffStatusFilter, setStaffStatusFilter] = useState<StatusFilter>("all");

  const typeEditor = useEntityEditor<ExpenseType>();
  const staffEditor = useEntityEditor<ExpenseStaff>();

  const categoryPagination = useTablePagination(categories.length);
  const pagedCategories = useMemo(
    () => sliceForPage(categories, categoryPagination.page, categoryPagination.pageSize),
    [categories, categoryPagination.page, categoryPagination.pageSize]
  );

  const filteredTypes = useMemo(() => {
    const needle = typeQuery.trim().toLowerCase();
    return types.filter((row) => {
      if (typeStatusFilter === "active" && !row.is_active) return false;
      if (typeStatusFilter === "inactive" && row.is_active) return false;
      if (!needle) return true;
      return row.name.toLowerCase().includes(needle) || row.code.toLowerCase().includes(needle);
    });
  }, [types, typeQuery, typeStatusFilter]);

  const filteredStaff = useMemo(() => {
    const needle = staffQuery.trim().toLowerCase();
    return staff.filter((row) => {
      if (staffStatusFilter === "active" && !row.is_active) return false;
      if (staffStatusFilter === "inactive" && row.is_active) return false;
      if (!needle) return true;
      return row.name.toLowerCase().includes(needle) || row.code.toLowerCase().includes(needle);
    });
  }, [staff, staffQuery, staffStatusFilter]);

  const typePagination = useTablePagination(filteredTypes.length, 10);
  const staffPagination = useTablePagination(filteredStaff.length, 10);

  useEffect(() => {
    typePagination.setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeQuery, typeStatusFilter]);

  useEffect(() => {
    staffPagination.setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffQuery, staffStatusFilter]);

  const pagedTypes = useMemo(
    () => sliceForPage(filteredTypes, typePagination.page, typePagination.pageSize),
    [filteredTypes, typePagination.page, typePagination.pageSize]
  );

  const pagedStaff = useMemo(
    () => sliceForPage(filteredStaff, staffPagination.page, staffPagination.pageSize),
    [filteredStaff, staffPagination.page, staffPagination.pageSize]
  );

  const criticalPending =
    creatingCategory ||
    categoryRenameSubmitting ||
    Boolean(categoryToggleSubmittingId) ||
    typeSubmitting ||
    toggleTypeSubmitting ||
    typeDeleting ||
    typeEditor.submitting ||
    staffSubmitting ||
    toggleStaffSubmitting ||
    staffDeleting ||
    staffEditor.submitting;

  function triggerRefresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function saveEntityEdit<T extends EditableEntity>(
    editor: EntityEditor<T>,
    endpoint: string,
    entityLabel: string
  ) {
    const target = editor.target;
    if (!target) return;
    editor.setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: target.id,
          code: normalizeEntityCode(editor.draft.code),
          name: editor.draft.name.trim()
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, `Failed to update ${entityLabel.toLowerCase()}.`));
        return;
      }
      setMessage(`${entityLabel} updated.`);
      editor.reset();
      triggerRefresh();
    } catch {
      setError(`Failed to update ${entityLabel.toLowerCase()} due to a network error.`);
    } finally {
      editor.setSubmitting(false);
    }
  }

  async function createCategory() {
    if (creatingCategory) return;
    const name = newCategoryName.trim();
    const code = newCategoryCode.trim().toUpperCase();
    if (name.length < 2 || code.length < 2) return;

    setCreatingCategory(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to create category."));
        return;
      }
      setMessage("Category added.");
      setNewCategoryName("");
      setNewCategoryCode("");
      triggerRefresh();
    } catch {
      setError("Failed to create category due to a network error.");
    } finally {
      setCreatingCategory(false);
    }
  }

  async function submitCategoryRename(next: string) {
    if (!categoryRenameTarget) return;
    setCategoryRenameSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: categoryRenameTarget.id, name: next })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Category rename failed."));
        return;
      }
      setMessage("Category renamed.");
      setCategoryRenameTarget(null);
      triggerRefresh();
    } catch {
      setError("Category rename failed due to a network error.");
    } finally {
      setCategoryRenameSubmitting(false);
    }
  }

  async function toggleCategoryActive(id: string, isActive: boolean) {
    if (categoryToggleSubmittingId) return;
    setCategoryToggleSubmittingId(id);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, is_active: !isActive })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Category update failed."));
        return;
      }
      setMessage(!isActive ? "Category enabled." : "Category disabled.");
      triggerRefresh();
    } catch {
      setError("Category update failed due to a network error.");
    } finally {
      setCategoryToggleSubmittingId(null);
    }
  }

  async function addType() {
    setTypeSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/expense-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: normalizeEntityCode(newTypeCode),
          name: newTypeName.trim()
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to add type."));
        return;
      }
      setMessage("Type added.");
      setPendingAddTypeConfirm(false);
      setNewTypeCode("");
      setNewTypeName("");
      triggerRefresh();
    } catch {
      setError("Failed to add type due to a network error.");
    } finally {
      setTypeSubmitting(false);
    }
  }

  async function toggleType() {
    if (!pendingToggleType) return;
    setToggleTypeSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/expense-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pendingToggleType.id,
          is_active: !pendingToggleType.is_active
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to update type."));
        return;
      }
      setMessage(`Type ${pendingToggleType.is_active ? "deactivated" : "activated"}.`);
      setPendingToggleType(null);
      triggerRefresh();
    } catch {
      setError("Failed to update type due to a network error.");
    } finally {
      setToggleTypeSubmitting(false);
    }
  }

  async function deleteType() {
    if (!pendingDeleteType) return;
    setTypeDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch(`/api/expense-types?id=${pendingDeleteType.id}`, {
        method: "DELETE"
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to delete type."));
        return;
      }
      setMessage("Type deleted.");
      setPendingDeleteType(null);
      triggerRefresh();
    } catch {
      setError("Failed to delete type due to a network error.");
    } finally {
      setTypeDeleting(false);
    }
  }

  async function addStaff() {
    setStaffSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/expense-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: normalizeEntityCode(newStaffCode),
          name: newStaffName.trim()
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to add staff."));
        return;
      }
      setMessage("Staff added.");
      setPendingAddStaffConfirm(false);
      setNewStaffCode("");
      setNewStaffName("");
      triggerRefresh();
    } catch {
      setError("Failed to add staff due to a network error.");
    } finally {
      setStaffSubmitting(false);
    }
  }

  async function toggleStaff() {
    if (!pendingToggleStaff) return;
    setToggleStaffSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/expense-staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pendingToggleStaff.id,
          is_active: !pendingToggleStaff.is_active
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to update staff."));
        return;
      }
      setMessage(`Staff ${pendingToggleStaff.is_active ? "deactivated" : "activated"}.`);
      setPendingToggleStaff(null);
      triggerRefresh();
    } catch {
      setError("Failed to update staff due to a network error.");
    } finally {
      setToggleStaffSubmitting(false);
    }
  }

  async function deleteStaff() {
    if (!pendingDeleteStaff) return;
    setStaffDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch(`/api/expense-staff?id=${pendingDeleteStaff.id}`, {
        method: "DELETE"
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to delete staff."));
        return;
      }
      setMessage("Staff deleted.");
      setPendingDeleteStaff(null);
      triggerRefresh();
    } catch {
      setError("Failed to delete staff due to a network error.");
    } finally {
      setStaffDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card relative" aria-busy={criticalPending}>
        <BlockingOverlay active={criticalPending} label="Processing settings..." />
        <h2 className="text-lg font-semibold">Category Management</h2>
        <p className="mt-1 text-sm text-muted">
          Categories are brand-specific. You can create, rename, enable, or disable categories for the active brand.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-3">
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
          <button
            className="btn-secondary"
            disabled={creatingCategory || newCategoryName.trim().length < 2 || newCategoryCode.trim().length < 2}
            onClick={() => void createCategory()}
          >
            {creatingCategory ? "Adding…" : "Add Category"}
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="data-table data-table-zebra min-w-full">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedCategories.length ? (
                pagedCategories.map((item) => (
                  <tr key={item.id} className="align-middle">
                    <td className="px-3 py-2 font-mono text-xs">{item.code}</td>
                    <td className="px-3 py-2 font-medium">{item.name}</td>
                    <td className="px-3 py-2">
                      <StatusBadge active={item.is_active} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          className="btn-secondary btn-sm"
                          disabled={Boolean(categoryToggleSubmittingId) || categoryRenameSubmitting}
                          onClick={() => setCategoryRenameTarget(item)}
                        >
                          Rename
                        </button>
                        <button
                          className="btn-secondary btn-sm"
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
                ))
              ) : (
                <TableEmptyState
                  colSpan={4}
                  message="No categories yet. Use the form above to add one."
                />
              )}
            </tbody>
          </table>
        </div>
        <TablePaginationBar
          totalCount={categories.length}
          page={categoryPagination.page}
          setPage={categoryPagination.setPage}
          pageSize={categoryPagination.pageSize}
          setPageSize={categoryPagination.setPageSize}
          pageCount={categoryPagination.pageCount}
          rangeLabel={categoryPagination.rangeLabel}
        />
      </section>

      <section
        className="card relative"
        aria-busy={typeSubmitting || toggleTypeSubmitting || typeDeleting || typeEditor.submitting}
      >
        <BlockingOverlay
          active={typeSubmitting || toggleTypeSubmitting || typeDeleting || typeEditor.submitting}
          label="Processing types..."
        />
        <h2 className="text-lg font-semibold">Type Management</h2>
        <p className="mt-1 text-sm text-muted">
          Manage spending types for the active brand. Type is optional on spending entries.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-3">
          <input
            className="field"
            placeholder="Code (e.g. OPERATIONAL)"
            maxLength={ENTITY_CODE_MAX_LENGTH}
            value={newTypeCode}
            onChange={(event) => setNewTypeCode(normalizeEntityCode(event.target.value))}
          />
          <input
            className="field"
            placeholder="Type Name"
            maxLength={100}
            value={newTypeName}
            onChange={(event) => setNewTypeName(event.target.value)}
          />
          <button
            className="btn"
            disabled={newTypeCode.trim().length < 2 || newTypeName.trim().length < 2 || typeSubmitting}
            onClick={() => setPendingAddTypeConfirm(true)}
          >
            Add Type
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">{ENTITY_CODE_HINT}</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-sm text-muted sm:col-span-2">
            <span className="mb-1 block">Search</span>
            <input
              className="field w-full"
              placeholder="Search by name or code..."
              value={typeQuery}
              onChange={(event) => setTypeQuery(event.target.value)}
            />
          </label>
          <label className="text-sm text-muted">
            <span className="mb-1 block">Status</span>
            <select
              className="field w-full"
              value={typeStatusFilter}
              onChange={(event) => setTypeStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="all">All</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="data-table data-table-zebra min-w-[640px]">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Sort</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedTypes.length ? (
                pagedTypes.map((type) => (
                  <tr key={type.id} className="align-middle">
                    <td className="px-3 py-2 font-mono text-xs">{type.code}</td>
                    <td className="px-3 py-2 font-medium">{type.name}</td>
                    <td className="px-3 py-2 text-xs text-[rgb(var(--text-muted))]">{type.sort_order}</td>
                    <td className="px-3 py-2">
                      <StatusBadge active={type.is_active} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => typeEditor.start(type)}
                          disabled={toggleTypeSubmitting || typeDeleting || typeEditor.submitting}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => setPendingToggleType(type)}
                          disabled={toggleTypeSubmitting || typeDeleting || typeEditor.submitting}
                        >
                          {type.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          className="btn-secondary btn-sm !border-[rgb(var(--danger)/0.35)] !text-[rgb(var(--danger))] hover:!bg-[rgb(var(--danger)/0.12)]"
                          onClick={() => setPendingDeleteType(type)}
                          disabled={toggleTypeSubmitting || typeDeleting || typeEditor.submitting}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <TableEmptyState
                  colSpan={5}
                  message={
                    types.length
                      ? "No types match the current filters."
                      : "No types yet. Use the form above to add one."
                  }
                />
              )}
            </tbody>
          </table>
        </div>
        <TablePaginationBar
          totalCount={filteredTypes.length}
          page={typePagination.page}
          setPage={typePagination.setPage}
          pageSize={typePagination.pageSize}
          setPageSize={typePagination.setPageSize}
          pageCount={typePagination.pageCount}
          rangeLabel={typePagination.rangeLabel}
        />
      </section>

      <section
        className="card relative"
        aria-busy={staffSubmitting || toggleStaffSubmitting || staffDeleting || staffEditor.submitting}
      >
        <BlockingOverlay
          active={staffSubmitting || toggleStaffSubmitting || staffDeleting || staffEditor.submitting}
          label="Processing staff..."
        />
        <h2 className="text-lg font-semibold">Staff Management</h2>
        <p className="mt-1 text-sm text-muted">
          Manage staff lookups for the active brand. Staff is optional on spending entries.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-3">
          <input
            className="field"
            placeholder="Code (e.g. JOHN)"
            maxLength={ENTITY_CODE_MAX_LENGTH}
            value={newStaffCode}
            onChange={(event) => setNewStaffCode(normalizeEntityCode(event.target.value))}
          />
          <input
            className="field"
            placeholder="Staff Name"
            maxLength={100}
            value={newStaffName}
            onChange={(event) => setNewStaffName(event.target.value)}
          />
          <button
            className="btn"
            disabled={newStaffCode.trim().length < 2 || newStaffName.trim().length < 2 || staffSubmitting}
            onClick={() => setPendingAddStaffConfirm(true)}
          >
            Add Staff
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">{ENTITY_CODE_HINT}</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-sm text-muted sm:col-span-2">
            <span className="mb-1 block">Search</span>
            <input
              className="field w-full"
              placeholder="Search by name or code..."
              value={staffQuery}
              onChange={(event) => setStaffQuery(event.target.value)}
            />
          </label>
          <label className="text-sm text-muted">
            <span className="mb-1 block">Status</span>
            <select
              className="field w-full"
              value={staffStatusFilter}
              onChange={(event) => setStaffStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="all">All</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="data-table data-table-zebra min-w-[640px]">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Sort</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedStaff.length ? (
                pagedStaff.map((member) => (
                  <tr key={member.id} className="align-middle">
                    <td className="px-3 py-2 font-mono text-xs">{member.code}</td>
                    <td className="px-3 py-2 font-medium">{member.name}</td>
                    <td className="px-3 py-2 text-xs text-[rgb(var(--text-muted))]">{member.sort_order}</td>
                    <td className="px-3 py-2">
                      <StatusBadge active={member.is_active} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => staffEditor.start(member)}
                          disabled={toggleStaffSubmitting || staffDeleting || staffEditor.submitting}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => setPendingToggleStaff(member)}
                          disabled={toggleStaffSubmitting || staffDeleting || staffEditor.submitting}
                        >
                          {member.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          className="btn-secondary btn-sm !border-[rgb(var(--danger)/0.35)] !text-[rgb(var(--danger))] hover:!bg-[rgb(var(--danger)/0.12)]"
                          onClick={() => setPendingDeleteStaff(member)}
                          disabled={toggleStaffSubmitting || staffDeleting || staffEditor.submitting}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <TableEmptyState
                  colSpan={5}
                  message={
                    staff.length
                      ? "No staff match the current filters."
                      : "No staff yet. Use the form above to add one."
                  }
                />
              )}
            </tbody>
          </table>
        </div>
        <TablePaginationBar
          totalCount={filteredStaff.length}
          page={staffPagination.page}
          setPage={staffPagination.setPage}
          pageSize={staffPagination.pageSize}
          setPageSize={staffPagination.setPageSize}
          pageCount={staffPagination.pageCount}
          rangeLabel={staffPagination.rangeLabel}
        />
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Guardrails</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Use deactivate instead of deleting types or staff tied to historical transactions.</li>
          <li>Rename keeps historical rows intact while improving naming consistency.</li>
          <li>RLS policies enforce least-privilege access for write operations.</li>
        </ul>
      </section>

      {error ? <p className="text-sm text-[rgb(var(--danger))]">{error}</p> : null}
      {message ? (
        <p className="text-sm text-[rgb(var(--success))]" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}

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

      <ConfirmDialog
        open={pendingAddTypeConfirm}
        onOpenChange={setPendingAddTypeConfirm}
        title="Add new type?"
        description="The new type will become available for future spending entries."
        confirmLabel="Add Type"
        confirming={typeSubmitting}
        closeOnBackdrop={false}
        onConfirm={addType}
      />

      <ConfirmDialog
        open={Boolean(pendingToggleType)}
        onOpenChange={(open) => {
          if (!open && !toggleTypeSubmitting) setPendingToggleType(null);
        }}
        title={pendingToggleType?.is_active ? "Deactivate type?" : "Activate type?"}
        description="Changing active state affects whether this type can be selected in new entries."
        confirmLabel={pendingToggleType?.is_active ? "Deactivate" : "Activate"}
        confirming={toggleTypeSubmitting}
        closeOnBackdrop={false}
        onConfirm={toggleType}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteType)}
        onOpenChange={(open) => {
          if (!open && !typeDeleting) setPendingDeleteType(null);
        }}
        title="Delete type?"
        description="This will permanently remove the type. Existing entries that reference it will have their type cleared."
        confirmLabel="Delete"
        confirming={typeDeleting}
        variant="danger"
        closeOnBackdrop={false}
        onConfirm={deleteType}
      />

      <ConfirmDialog
        open={pendingAddStaffConfirm}
        onOpenChange={setPendingAddStaffConfirm}
        title="Add new staff?"
        description="The new staff member will become available for future spending entries."
        confirmLabel="Add Staff"
        confirming={staffSubmitting}
        closeOnBackdrop={false}
        onConfirm={addStaff}
      />

      <ConfirmDialog
        open={Boolean(pendingToggleStaff)}
        onOpenChange={(open) => {
          if (!open && !toggleStaffSubmitting) setPendingToggleStaff(null);
        }}
        title={pendingToggleStaff?.is_active ? "Deactivate staff?" : "Activate staff?"}
        description="Changing active state affects whether this staff member can be selected in new entries."
        confirmLabel={pendingToggleStaff?.is_active ? "Deactivate" : "Activate"}
        confirming={toggleStaffSubmitting}
        closeOnBackdrop={false}
        onConfirm={toggleStaff}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteStaff)}
        onOpenChange={(open) => {
          if (!open && !staffDeleting) setPendingDeleteStaff(null);
        }}
        title="Delete staff?"
        description="This will permanently remove the staff member. Existing entries that reference them will have their staff cleared."
        confirmLabel="Delete"
        confirming={staffDeleting}
        variant="danger"
        closeOnBackdrop={false}
        onConfirm={deleteStaff}
      />

      <EntityEditDialog
        editor={typeEditor}
        entityLabel="Type"
        description="Existing entries keep pointing at this type; only its code and name change."
        onSave={() => saveEntityEdit(typeEditor, "/api/expense-types", "Type")}
      />

      <EntityEditDialog
        editor={staffEditor}
        entityLabel="Staff"
        description="Existing entries keep pointing at this staff member; only their code and name change."
        onSave={() => saveEntityEdit(staffEditor, "/api/expense-staff", "Staff")}
      />
    </div>
  );
}
