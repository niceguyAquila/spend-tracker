"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BigBookInvoiceWallet } from "@/lib/types";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BlockingOverlay } from "@/components/ui/blocking-overlay";
import { TableEmptyState } from "@/components/ui/table-empty-state";
import { TablePaginationBar } from "@/components/ui/table-pagination-bar";
import { Modal } from "@/components/ui/modal";
import { sliceForPage, useTablePagination } from "@/lib/table-pagination";

type StatusFilter = "all" | "active" | "inactive";

type Props = {
  initialWallets: BigBookInvoiceWallet[];
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

export function BigBookWalletsSettingsSection({ initialWallets }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newNetwork, setNewNetwork] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [pendingAdd, setPendingAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pendingToggle, setPendingToggle] = useState<BigBookInvoiceWallet | null>(null);
  const [toggleSubmitting, setToggleSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BigBookInvoiceWallet | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<BigBookInvoiceWallet | null>(null);
  const [editName, setEditName] = useState("");
  const [editNetwork, setEditNetwork] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return initialWallets.filter((row) => {
      if (statusFilter === "active" && !row.is_active) return false;
      if (statusFilter === "inactive" && row.is_active) return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) ||
        row.network.toLowerCase().includes(needle) ||
        row.address.toLowerCase().includes(needle)
      );
    });
  }, [initialWallets, query, statusFilter]);

  const pagination = useTablePagination(filtered.length, 10);
  useEffect(() => {
    pagination.setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when filters change
  }, [query, statusFilter]);

  const paged = useMemo(
    () => sliceForPage(filtered, pagination.page, pagination.pageSize),
    [filtered, pagination.page, pagination.pageSize]
  );

  const busy = submitting || toggleSubmitting || deleting || editSubmitting;

  function triggerRefresh() {
    startTransition(() => router.refresh());
  }

  async function addWallet() {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          network: newNetwork.trim(),
          address: newAddress.trim()
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to add wallet."));
        return;
      }
      setNewName("");
      setNewNetwork("");
      setNewAddress("");
      setPendingAdd(false);
      setMessage("Wallet added.");
      triggerRefresh();
    } catch {
      setError("Failed to add wallet due to a network error.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(wallet: BigBookInvoiceWallet) {
    setEditTarget(wallet);
    setEditName(wallet.name);
    setEditNetwork(wallet.network);
    setEditAddress(wallet.address);
    setError(null);
  }

  async function saveEdit() {
    if (!editTarget) return;
    setEditSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/wallets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editTarget.id,
          name: editName.trim(),
          network: editNetwork.trim(),
          address: editAddress.trim()
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to update wallet."));
        return;
      }
      setEditTarget(null);
      setMessage("Wallet updated.");
      triggerRefresh();
    } catch {
      setError("Failed to update wallet due to a network error.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function toggleWallet() {
    if (!pendingToggle) return;
    setToggleSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch("/api/big-book/wallets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pendingToggle.id,
          is_active: !pendingToggle.is_active
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to update wallet status."));
        return;
      }
      setPendingToggle(null);
      setMessage(pendingToggle.is_active ? "Wallet deactivated." : "Wallet activated.");
      triggerRefresh();
    } catch {
      setError("Failed to update wallet status due to a network error.");
    } finally {
      setToggleSubmitting(false);
    }
  }

  async function deleteWallet() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await secureFetch(`/api/big-book/wallets?id=${encodeURIComponent(pendingDelete.id)}`, {
        method: "DELETE"
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to delete wallet."));
        return;
      }
      setPendingDelete(null);
      setMessage("Wallet deleted.");
      triggerRefresh();
    } catch {
      setError("Failed to delete wallet due to a network error.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="card relative" aria-busy={busy}>
      <BlockingOverlay active={busy} label="Processing wallets..." />
      <h2 className="text-lg font-semibold">Invoice Wallets</h2>
      <p className="mt-1 text-sm text-muted">
        Manage payment wallets that can be selected when downloading an invoice PDF.
      </p>

      {message ? <p className="mt-3 text-sm text-[rgb(var(--success))]">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-[rgb(var(--danger))]">{error}</p> : null}

      <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-4">
        <input
          className="field"
          placeholder="Name (e.g. Binance USDT)"
          maxLength={100}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <input
          className="field"
          placeholder="Network (e.g. TRC20)"
          maxLength={80}
          value={newNetwork}
          onChange={(event) => setNewNetwork(event.target.value)}
        />
        <input
          className="field lg:col-span-1"
          placeholder="Address"
          maxLength={200}
          value={newAddress}
          onChange={(event) => setNewAddress(event.target.value)}
        />
        <button
          className="btn"
          disabled={
            newName.trim().length < 2 ||
            newNetwork.trim().length < 2 ||
            newAddress.trim().length < 4 ||
            submitting
          }
          onClick={() => setPendingAdd(true)}
        >
          Add Wallet
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="text-sm text-muted sm:col-span-2">
          <span className="mb-1 block">Search</span>
          <input
            className="field w-full"
            placeholder="Search by name, network, or address..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="text-sm text-muted">
          <span className="mb-1 block">Status</span>
          <select
            className="field w-full"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="all">All</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </label>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="data-table data-table-zebra min-w-[820px]">
          <thead>
            <tr>
              <th>Name</th>
              <th>Network</th>
              <th>Address</th>
              <th>Sort</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.length ? (
              paged.map((wallet) => (
                <tr key={wallet.id} className="align-middle">
                  <td className="px-3 py-2 font-medium">{wallet.name}</td>
                  <td className="px-3 py-2 text-xs">{wallet.network}</td>
                  <td className="px-3 py-2 font-mono text-xs break-all">{wallet.address}</td>
                  <td className="px-3 py-2 text-xs text-[rgb(var(--text-muted))]">{wallet.sort_order}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                        wallet.is_active
                          ? "bg-[rgb(var(--success)/0.15)] text-[rgb(var(--success))]"
                          : "bg-[rgb(var(--surface-muted))] text-muted"
                      }`}
                    >
                      {wallet.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => startEdit(wallet)}
                        disabled={busy}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => setPendingToggle(wallet)}
                        disabled={busy}
                      >
                        {wallet.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        className="btn-secondary btn-sm !border-[rgb(var(--danger)/0.35)] !text-[rgb(var(--danger))] hover:!bg-[rgb(var(--danger)/0.12)]"
                        onClick={() => setPendingDelete(wallet)}
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <TableEmptyState
                colSpan={6}
                message={
                  initialWallets.length
                    ? "No wallets match the current filters."
                    : "No wallets yet. Use the form above to add one."
                }
              />
            )}
          </tbody>
        </table>
      </div>
      <TablePaginationBar
        totalCount={filtered.length}
        page={pagination.page}
        setPage={pagination.setPage}
        pageSize={pagination.pageSize}
        setPageSize={pagination.setPageSize}
        pageCount={pagination.pageCount}
        rangeLabel={pagination.rangeLabel}
      />

      <ConfirmDialog
        open={pendingAdd}
        onOpenChange={setPendingAdd}
        title="Add new wallet?"
        description="The wallet will be available to select on invoice PDFs."
        confirmLabel="Add Wallet"
        confirming={submitting}
        closeOnBackdrop={false}
        onConfirm={addWallet}
      />

      <ConfirmDialog
        open={Boolean(pendingToggle)}
        onOpenChange={(open) => {
          if (!open && !toggleSubmitting) setPendingToggle(null);
        }}
        title={pendingToggle?.is_active ? "Deactivate wallet?" : "Activate wallet?"}
        description="Inactive wallets cannot be selected on new invoices."
        confirmLabel={pendingToggle?.is_active ? "Deactivate" : "Activate"}
        confirming={toggleSubmitting}
        closeOnBackdrop={false}
        onConfirm={toggleWallet}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
        title="Delete wallet?"
        description="This permanently removes the wallet from settings. Existing downloaded PDFs are unaffected."
        confirmLabel="Delete"
        confirming={deleting}
        variant="danger"
        closeOnBackdrop={false}
        onConfirm={deleteWallet}
      />

      <Modal
        open={Boolean(editTarget)}
        onOpenChange={(open) => {
          if (!open && !editSubmitting) setEditTarget(null);
        }}
        title="Edit wallet"
        size="md"
        dismissible={!editSubmitting}
        closeOnBackdrop={false}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={editSubmitting}
              onClick={() => setEditTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              disabled={
                editSubmitting ||
                editName.trim().length < 2 ||
                editNetwork.trim().length < 2 ||
                editAddress.trim().length < 4
              }
              onClick={() => void saveEdit()}
            >
              {editSubmitting ? "Saving…" : "Save"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm">
            Name
            <input
              className="field mt-1 w-full"
              maxLength={100}
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Network
            <input
              className="field mt-1 w-full"
              maxLength={80}
              value={editNetwork}
              onChange={(event) => setEditNetwork(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Address
            <input
              className="field mt-1 w-full"
              maxLength={200}
              value={editAddress}
              onChange={(event) => setEditAddress(event.target.value)}
            />
          </label>
        </div>
      </Modal>
    </section>
  );
}
