"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BigBookLedgerType, BigBookTypeVendorTypeMap, BigBookVendorType } from "@/lib/types";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BlockingOverlay } from "@/components/ui/blocking-overlay";
import { TableEmptyState } from "@/components/ui/table-empty-state";

type Props = {
  initialMaps: BigBookTypeVendorTypeMap[];
  types: BigBookLedgerType[];
  vendorTypes: BigBookVendorType[];
};

function extractApiError(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim().length > 0) return error;
  if (error && typeof error === "object") {
    const maybe = error as { formErrors?: unknown; fieldErrors?: Record<string, unknown> };
    if (Array.isArray(maybe.formErrors)) {
      const formError = maybe.formErrors.find((item) => typeof item === "string" && item.trim());
      if (typeof formError === "string") return formError;
    }
    if (maybe.fieldErrors) {
      for (const value of Object.values(maybe.fieldErrors)) {
        if (Array.isArray(value)) {
          const fieldError = value.find((item) => typeof item === "string" && item.trim());
          if (typeof fieldError === "string") return fieldError;
        }
      }
    }
  }
  return fallback;
}

export function BigBookTypeVendorTypeMapSection({ initialMaps, types, vendorTypes }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entryTypeId, setEntryTypeId] = useState("");
  const [vendorTypeId, setVendorTypeId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingAdd, setPendingAdd] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BigBookTypeVendorTypeMap | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVendorTypeId, setEditVendorTypeId] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const activeTypes = useMemo(() => types.filter((row) => row.is_active), [types]);
  const activeVendorTypes = useMemo(() => vendorTypes.filter((row) => row.is_active), [vendorTypes]);
  const mappedTypeIds = useMemo(
    () => new Set(initialMaps.map((row) => row.entry_type_id)),
    [initialMaps]
  );
  const availableTypes = useMemo(
    () => activeTypes.filter((row) => !mappedTypeIds.has(row.id)),
    [activeTypes, mappedTypeIds]
  );

  function triggerRefresh() {
    startTransition(() => router.refresh());
  }

  async function addMapping() {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/type-vendor-type-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_type_id: entryTypeId,
          vendor_type_id: vendorTypeId
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to add Type → Vendor Type mapping."));
        return;
      }
      setMessage("Type → Vendor Type mapping added.");
      setPendingAdd(false);
      setEntryTypeId("");
      setVendorTypeId("");
      triggerRefresh();
    } catch {
      setError("Failed to add mapping due to a network error.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    setEditSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/type-vendor-type-maps", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          vendor_type_id: editVendorTypeId
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to update mapping."));
        return;
      }
      setMessage("Type → Vendor Type mapping updated.");
      setEditingId(null);
      setEditVendorTypeId("");
      triggerRefresh();
    } catch {
      setError("Failed to update mapping due to a network error.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function deleteMapping() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/type-vendor-type-maps", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pendingDelete.id })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to delete mapping."));
        return;
      }
      setMessage("Type → Vendor Type mapping removed.");
      setPendingDelete(null);
      triggerRefresh();
    } catch {
      setError("Failed to delete mapping due to a network error.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="card relative" aria-busy={submitting || deleting || editSubmitting}>
      <BlockingOverlay
        active={submitting || deleting || editSubmitting}
        label="Processing type mappings..."
      />
      <h2 className="text-lg font-semibold">Type → Vendor Type Mapping</h2>
      <p className="mt-1 text-sm text-muted">
        Each Type maps to at most one Vendor Type. Selecting a Type on create/edit auto-fills Vendor Type
        from this table.
      </p>
      {message ? <p className="mt-2 text-sm text-[rgb(var(--success))]">{message}</p> : null}
      {error ? <p className="mt-2 text-sm text-[rgb(var(--danger))]">{error}</p> : null}

      <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Type</span>
          <select
            className="field w-full"
            value={entryTypeId}
            onChange={(event) => setEntryTypeId(event.target.value)}
          >
            <option value="">Select type…</option>
            {availableTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Vendor Type</span>
          <select
            className="field w-full"
            value={vendorTypeId}
            onChange={(event) => setVendorTypeId(event.target.value)}
          >
            <option value="">Select vendor type…</option>
            {activeVendorTypes.map((vendorType) => (
              <option key={vendorType.id} value={vendorType.id}>
                {vendorType.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            className="btn w-full"
            disabled={!entryTypeId || !vendorTypeId || submitting}
            onClick={() => setPendingAdd(true)}
          >
            Add Mapping
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="data-table data-table-zebra min-w-[640px]">
          <thead>
            <tr>
              <th>Type</th>
              <th>Vendor Type</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {initialMaps.length ? (
              initialMaps.map((row) => {
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.id} className="align-middle">
                    <td className="px-3 py-2 font-medium">
                      {row.type_name ?? types.find((t) => t.id === row.entry_type_id)?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <select
                          className="field"
                          value={editVendorTypeId}
                          onChange={(event) => setEditVendorTypeId(event.target.value)}
                        >
                          {activeVendorTypes.map((vendorType) => (
                            <option key={vendorType.id} value={vendorType.id}>
                              {vendorType.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        row.vendor_type_name ??
                        vendorTypes.find((v) => v.id === row.vendor_type_id)?.name ??
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {isEditing ? (
                          <>
                            <button
                              className="btn btn-sm"
                              onClick={() => void saveEdit()}
                              disabled={!editVendorTypeId || editSubmitting}
                            >
                              Save
                            </button>
                            <button
                              className="btn-secondary btn-sm"
                              onClick={() => {
                                setEditingId(null);
                                setEditVendorTypeId("");
                              }}
                              disabled={editSubmitting}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn-secondary btn-sm"
                              onClick={() => {
                                setEditingId(row.id);
                                setEditVendorTypeId(row.vendor_type_id);
                              }}
                              disabled={editSubmitting || deleting}
                            >
                              Edit
                            </button>
                            <button
                              className="btn-secondary btn-sm"
                              onClick={() => setPendingDelete(row)}
                              disabled={editSubmitting || deleting}
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <TableEmptyState
                colSpan={3}
                message="No mappings yet. Map a Type to a Vendor Type above."
              />
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={pendingAdd}
        onOpenChange={setPendingAdd}
        title="Add Type → Vendor Type mapping?"
        description="Selecting this Type on ledger create/edit will auto-fill the mapped Vendor Type."
        confirmLabel="Add Mapping"
        confirming={submitting}
        closeOnBackdrop={false}
        onConfirm={addMapping}
      />
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
        title="Remove mapping?"
        description="Existing ledger entries keep their Vendor Type. New create/edit forms will no longer auto-fill from this Type."
        confirmLabel="Remove"
        confirming={deleting}
        variant="danger"
        closeOnBackdrop={false}
        onConfirm={deleteMapping}
      />
    </section>
  );
}
