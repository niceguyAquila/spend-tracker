"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  CreditBookActor,
  CreditBookAllowedUserOption,
  CreditBookLedgerSubType,
  CreditBookLedgerType
} from "@/lib/types";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BlockingOverlay } from "@/components/ui/blocking-overlay";
import { TablePaginationBar } from "@/components/ui/table-pagination-bar";
import { sliceForPage, useTablePagination } from "@/lib/table-pagination";

type StatusFilter = "all" | "active" | "inactive";

type Props = {
  initialTypes: CreditBookLedgerType[];
  initialSubTypes: CreditBookLedgerSubType[];
  initialActors: CreditBookActor[];
  allowedUsers: CreditBookAllowedUserOption[];
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

export function CreditBigBookSettingsPanel({ initialTypes, initialSubTypes, initialActors, allowedUsers }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTypeCode, setNewTypeCode] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const [pendingAddTypeConfirm, setPendingAddTypeConfirm] = useState(false);
  const [typeSubmitting, setTypeSubmitting] = useState(false);
  const [pendingToggleType, setPendingToggleType] = useState<CreditBookLedgerType | null>(null);
  const [toggleTypeSubmitting, setToggleTypeSubmitting] = useState(false);
  const [actorDrafts, setActorDrafts] = useState<Record<string, { display_name: string; user_id: string }>>(() => {
    const draftMap: Record<string, { display_name: string; user_id: string }> = {};
    for (const actor of initialActors) {
      draftMap[actor.id] = { display_name: actor.display_name, user_id: actor.user_id ?? "" };
    }
    return draftMap;
  });
  const [pendingActorId, setPendingActorId] = useState<string | null>(null);
  const [actorSubmitting, setActorSubmitting] = useState(false);

  const [subTypeParentTypeId, setSubTypeParentTypeId] = useState<string>(() => initialTypes[0]?.id ?? "");
  const [newSubTypeCode, setNewSubTypeCode] = useState("");
  const [newSubTypeName, setNewSubTypeName] = useState("");
  const [pendingAddSubTypeConfirm, setPendingAddSubTypeConfirm] = useState(false);
  const [subTypeSubmitting, setSubTypeSubmitting] = useState(false);
  const [pendingToggleSubType, setPendingToggleSubType] = useState<CreditBookLedgerSubType | null>(null);
  const [toggleSubTypeSubmitting, setToggleSubTypeSubmitting] = useState(false);
  const [pendingDeleteSubType, setPendingDeleteSubType] = useState<CreditBookLedgerSubType | null>(null);
  const [subTypeDeleting, setSubTypeDeleting] = useState(false);

  const subTypesForSelectedType = useMemo(
    () => initialSubTypes.filter((row) => row.entry_type_id === subTypeParentTypeId),
    [initialSubTypes, subTypeParentTypeId]
  );

  const [typeQuery, setTypeQuery] = useState("");
  const [typeStatusFilter, setTypeStatusFilter] = useState<StatusFilter>("all");
  const [subTypeQuery, setSubTypeQuery] = useState("");
  const [subTypeStatusFilter, setSubTypeStatusFilter] = useState<StatusFilter>("all");

  const filteredTypes = useMemo(() => {
    const needle = typeQuery.trim().toLowerCase();
    return initialTypes.filter((row) => {
      if (typeStatusFilter === "active" && !row.is_active) return false;
      if (typeStatusFilter === "inactive" && row.is_active) return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) ||
        row.code.toLowerCase().includes(needle)
      );
    });
  }, [initialTypes, typeQuery, typeStatusFilter]);

  const filteredSubTypes = useMemo(() => {
    const needle = subTypeQuery.trim().toLowerCase();
    return subTypesForSelectedType.filter((row) => {
      if (subTypeStatusFilter === "active" && !row.is_active) return false;
      if (subTypeStatusFilter === "inactive" && row.is_active) return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) ||
        row.code.toLowerCase().includes(needle)
      );
    });
  }, [subTypesForSelectedType, subTypeQuery, subTypeStatusFilter]);

  const typePagination = useTablePagination(filteredTypes.length, 10);
  const subTypePagination = useTablePagination(filteredSubTypes.length, 10);

  useEffect(() => {
    typePagination.setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeQuery, typeStatusFilter]);

  useEffect(() => {
    subTypePagination.setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTypeQuery, subTypeStatusFilter, subTypeParentTypeId]);

  const pagedTypes = useMemo(
    () => sliceForPage(filteredTypes, typePagination.page, typePagination.pageSize),
    [filteredTypes, typePagination.page, typePagination.pageSize]
  );
  const pagedSubTypes = useMemo(
    () => sliceForPage(filteredSubTypes, subTypePagination.page, subTypePagination.pageSize),
    [filteredSubTypes, subTypePagination.page, subTypePagination.pageSize]
  );

  const criticalPending =
    typeSubmitting ||
    toggleTypeSubmitting ||
    actorSubmitting ||
    subTypeSubmitting ||
    toggleSubTypeSubmitting ||
    subTypeDeleting;

  function triggerRefresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function addType() {
    setTypeSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/credit-big-book/types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newTypeCode.trim().toUpperCase(),
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
      const response = await secureFetch("/api/credit-big-book/types", {
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

  async function addSubType() {
    if (!subTypeParentTypeId) {
      setError("Select a parent type first.");
      return;
    }
    setSubTypeSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/credit-big-book/sub-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_type_id: subTypeParentTypeId,
          code: newSubTypeCode.trim().toUpperCase(),
          name: newSubTypeName.trim()
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to add sub-type."));
        return;
      }
      setMessage("Sub-Type added.");
      setPendingAddSubTypeConfirm(false);
      setNewSubTypeCode("");
      setNewSubTypeName("");
      triggerRefresh();
    } catch {
      setError("Failed to add sub-type due to a network error.");
    } finally {
      setSubTypeSubmitting(false);
    }
  }

  async function toggleSubType() {
    if (!pendingToggleSubType) return;
    setToggleSubTypeSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/credit-big-book/sub-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pendingToggleSubType.id,
          is_active: !pendingToggleSubType.is_active
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to update sub-type."));
        return;
      }
      setMessage(`Sub-Type ${pendingToggleSubType.is_active ? "deactivated" : "activated"}.`);
      setPendingToggleSubType(null);
      triggerRefresh();
    } catch {
      setError("Failed to update sub-type due to a network error.");
    } finally {
      setToggleSubTypeSubmitting(false);
    }
  }

  async function deleteSubType() {
    if (!pendingDeleteSubType) return;
    setSubTypeDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch(
        `/api/credit-big-book/sub-types?id=${pendingDeleteSubType.id}`,
        { method: "DELETE" }
      );
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to delete sub-type."));
        return;
      }
      setMessage("Sub-Type deleted.");
      setPendingDeleteSubType(null);
      triggerRefresh();
    } catch {
      setError("Failed to delete sub-type due to a network error.");
    } finally {
      setSubTypeDeleting(false);
    }
  }

  async function saveActorMapping() {
    if (!pendingActorId) return;
    const draft = actorDrafts[pendingActorId];
    if (!draft) return;
    setActorSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/credit-big-book/actors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pendingActorId,
          display_name: draft.display_name.trim(),
          user_id: draft.user_id || null
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to update actor mapping."));
        return;
      }
      setMessage("Actor mapping updated.");
      setPendingActorId(null);
      triggerRefresh();
    } catch {
      setError("Failed to update actor mapping due to a network error.");
    } finally {
      setActorSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card relative" aria-busy={criticalPending}>
        <BlockingOverlay active={criticalPending} label="Processing settings..." />
        <h2 className="text-lg font-semibold">Type Management</h2>
        <p className="mt-1 text-sm text-slate-600">Add new types and activate/deactivate existing ones.</p>
        <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-3">
          <input
            className="field"
            placeholder="Code (e.g. RECEIVABLE)"
            value={newTypeCode}
            onChange={(event) => setNewTypeCode(event.target.value)}
          />
          <input
            className="field"
            placeholder="Type Name"
            value={newTypeName}
            onChange={(event) => setNewTypeName(event.target.value)}
          />
          <button
            className="btn"
            disabled={!newTypeCode.trim() || !newTypeName.trim() || typeSubmitting}
            onClick={() => setPendingAddTypeConfirm(true)}
          >
            Add Type
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-sm text-slate-700 sm:col-span-2">
            <span className="mb-1 block">Search</span>
            <input
              className="field w-full"
              placeholder="Search by name or code..."
              value={typeQuery}
              onChange={(event) => setTypeQuery(event.target.value)}
            />
          </label>
          <label className="text-sm text-slate-700">
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
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Sort</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedTypes.length ? (
                pagedTypes.map((type) => (
                  <tr key={type.id} className="border-b border-[rgb(var(--border))] align-middle">
                    <td className="px-3 py-2 font-mono text-xs">{type.code}</td>
                    <td className="px-3 py-2 font-medium">{type.name}</td>
                    <td className="px-3 py-2 text-xs text-[rgb(var(--text-muted))]">{type.sort_order}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                          type.is_active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {type.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => setPendingToggleType(type)}
                        disabled={toggleTypeSubmitting}
                      >
                        {type.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-600" colSpan={5}>
                    {initialTypes.length
                      ? "No types match the current filters."
                      : "No types yet. Use the form above to add one."}
                  </td>
                </tr>
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

      <section className="card relative" aria-busy={subTypeSubmitting || toggleSubTypeSubmitting || subTypeDeleting}>
        <BlockingOverlay
          active={subTypeSubmitting || toggleSubTypeSubmitting || subTypeDeleting}
          label="Processing sub-types..."
        />
        <h2 className="text-lg font-semibold">Sub-Type Management</h2>
        <p className="mt-1 text-sm text-slate-600">
          Manage sub-types per parent type. Sub-Types are optional on ledger entries and can be left empty.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-4">
          <select
            className="field"
            value={subTypeParentTypeId}
            onChange={(event) => setSubTypeParentTypeId(event.target.value)}
            aria-label="Parent type for sub-types"
          >
            <option value="" disabled>
              Select parent type
            </option>
            {initialTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name} {type.is_active ? "" : "(inactive)"}
              </option>
            ))}
          </select>
          <input
            className="field"
            placeholder="Code (e.g. INVOICE)"
            value={newSubTypeCode}
            onChange={(event) => setNewSubTypeCode(event.target.value)}
          />
          <input
            className="field"
            placeholder="Sub-Type Name"
            value={newSubTypeName}
            onChange={(event) => setNewSubTypeName(event.target.value)}
          />
          <button
            className="btn"
            disabled={
              !subTypeParentTypeId ||
              !newSubTypeCode.trim() ||
              !newSubTypeName.trim() ||
              subTypeSubmitting
            }
            onClick={() => setPendingAddSubTypeConfirm(true)}
          >
            Add Sub-Type
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-sm text-slate-700 sm:col-span-2">
            <span className="mb-1 block">Search</span>
            <input
              className="field w-full"
              placeholder="Search by name or code..."
              value={subTypeQuery}
              onChange={(event) => setSubTypeQuery(event.target.value)}
              disabled={!subTypeParentTypeId}
            />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block">Status</span>
            <select
              className="field w-full"
              value={subTypeStatusFilter}
              onChange={(event) => setSubTypeStatusFilter(event.target.value as StatusFilter)}
              disabled={!subTypeParentTypeId}
            >
              <option value="all">All</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Sort</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!subTypeParentTypeId ? (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-600" colSpan={5}>
                    Select a parent type to view its sub-types.
                  </td>
                </tr>
              ) : pagedSubTypes.length ? (
                pagedSubTypes.map((subType) => (
                  <tr key={subType.id} className="border-b border-[rgb(var(--border))] align-middle">
                    <td className="px-3 py-2 font-mono text-xs">{subType.code}</td>
                    <td className="px-3 py-2 font-medium">{subType.name}</td>
                    <td className="px-3 py-2 text-xs text-[rgb(var(--text-muted))]">{subType.sort_order}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                          subType.is_active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {subType.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => setPendingToggleSubType(subType)}
                          disabled={toggleSubTypeSubmitting || subTypeDeleting}
                        >
                          {subType.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          className="btn-secondary btn-sm !border-rose-300 !text-rose-700 hover:!bg-rose-50"
                          onClick={() => setPendingDeleteSubType(subType)}
                          disabled={toggleSubTypeSubmitting || subTypeDeleting}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-600" colSpan={5}>
                    {subTypesForSelectedType.length
                      ? "No sub-types match the current filters."
                      : "No sub-types for this type yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePaginationBar
          totalCount={filteredSubTypes.length}
          page={subTypePagination.page}
          setPage={subTypePagination.setPage}
          pageSize={subTypePagination.pageSize}
          setPageSize={subTypePagination.setPageSize}
          pageCount={subTypePagination.pageCount}
          rangeLabel={subTypePagination.rangeLabel}
          show={Boolean(subTypeParentTypeId)}
        />
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Actor A/B Mapping</h2>
        <p className="mt-1 text-sm text-slate-600">Both actors share the same authority level and are fixed globally.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {initialActors.map((actor) => (
            <div key={actor.id} className="rounded-md border border-slate-200 p-3">
              <p className="font-medium">Actor {actor.actor_code}</p>
              <label className="mt-2 block text-sm">
                Display Name
                <input
                  className="field mt-1"
                  value={actorDrafts[actor.id]?.display_name ?? actor.display_name}
                  onChange={(event) =>
                    setActorDrafts((prev) => ({
                      ...prev,
                      [actor.id]: { ...(prev[actor.id] ?? { display_name: "", user_id: "" }), display_name: event.target.value }
                    }))
                  }
                />
              </label>
              <label className="mt-2 block text-sm">
                Linked User
                <select
                  className="field mt-1"
                  value={actorDrafts[actor.id]?.user_id ?? ""}
                  onChange={(event) =>
                    setActorDrafts((prev) => ({
                      ...prev,
                      [actor.id]: { ...(prev[actor.id] ?? { display_name: actor.display_name, user_id: "" }), user_id: event.target.value }
                    }))
                  }
                >
                  <option value="">Unassigned</option>
                  {allowedUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.display_name} ({user.email})
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn-secondary mt-3" onClick={() => setPendingActorId(actor.id)} disabled={actorSubmitting}>
                Save Actor Mapping
              </button>
            </div>
          ))}
        </div>
      </section>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <ConfirmDialog
        open={pendingAddTypeConfirm}
        onOpenChange={setPendingAddTypeConfirm}
        title="Add new type?"
        description="The new type will become available for future Credit Big Book records."
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
        description="Changing active state affects whether this type can be selected in new records."
        confirmLabel={pendingToggleType?.is_active ? "Deactivate" : "Activate"}
        confirming={toggleTypeSubmitting}
        closeOnBackdrop={false}
        onConfirm={toggleType}
      />

      <ConfirmDialog
        open={pendingAddSubTypeConfirm}
        onOpenChange={setPendingAddSubTypeConfirm}
        title="Add new sub-type?"
        description="The new sub-type will be available under the selected parent type."
        confirmLabel="Add Sub-Type"
        confirming={subTypeSubmitting}
        closeOnBackdrop={false}
        onConfirm={addSubType}
      />

      <ConfirmDialog
        open={Boolean(pendingToggleSubType)}
        onOpenChange={(open) => {
          if (!open && !toggleSubTypeSubmitting) setPendingToggleSubType(null);
        }}
        title={pendingToggleSubType?.is_active ? "Deactivate sub-type?" : "Activate sub-type?"}
        description="Changing active state affects whether this sub-type can be selected in new records."
        confirmLabel={pendingToggleSubType?.is_active ? "Deactivate" : "Activate"}
        confirming={toggleSubTypeSubmitting}
        closeOnBackdrop={false}
        onConfirm={toggleSubType}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteSubType)}
        onOpenChange={(open) => {
          if (!open && !subTypeDeleting) setPendingDeleteSubType(null);
        }}
        title="Delete sub-type?"
        description="This will permanently remove the sub-type. Existing entries that reference it will have their sub-type cleared."
        confirmLabel="Delete"
        confirming={subTypeDeleting}
        variant="danger"
        closeOnBackdrop={false}
        onConfirm={deleteSubType}
      />

      <ConfirmDialog
        open={Boolean(pendingActorId)}
        onOpenChange={(open) => {
          if (!open && !actorSubmitting) setPendingActorId(null);
        }}
        title="Save actor mapping?"
        description="This changes the global Actor A/B identity mapping used across all brands."
        confirmLabel="Save Mapping"
        confirming={actorSubmitting}
        closeOnBackdrop={false}
        onConfirm={saveActorMapping}
      />
    </div>
  );
}
