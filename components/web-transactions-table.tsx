"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { WebTransaction } from "@/lib/types";
import { formatAmount, formatDateTimeDisplay, getAmountColorClass } from "@/lib/display-format";
import { sliceForPage, useTablePagination } from "@/lib/table-pagination";
import { TablePaginationBar } from "@/components/ui/table-pagination-bar";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";

type Props = {
  rows: WebTransaction[];
  sourceSystem: "backoffice" | "payment_gateway";
  canManage: boolean;
};

type CreateDraft = {
  externalTxnNo: string;
  canonicalStatus: string;
  canonicalType: string;
  amount: string;
  merchantFee: string;
  merchantName: string;
  createTime: string;
  lastUpdateTime: string;
};

function toDateTimeInputValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function parseNumberInput(value: string, fallback = 0) {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function getTypeColorClass(type: string) {
  const normalized = type.trim().toLowerCase();
  if (normalized === "payout") return "text-rose-600";
  if (normalized === "payin") return "text-blue-600";
  return "";
}

function getTypeAmountColorClass(type: string, value: number | null) {
  if (value === null) return "";
  if (Object.is(value, 0) || Object.is(value, -0)) return "";
  return getTypeColorClass(type);
}

function defaultDraft(): CreateDraft {
  const now = new Date().toISOString();
  const nowInput = toDateTimeInputValue(now);
  return {
    externalTxnNo: "",
    canonicalStatus: "",
    canonicalType: "",
    amount: "",
    merchantFee: "",
    merchantName: "",
    createTime: nowInput,
    lastUpdateTime: nowInput
  };
}

export function WebTransactionsTable({ rows, sourceSystem, canManage }: Props) {
  const router = useRouter();
  const pagination = useTablePagination(rows.length);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const [viewingRow, setViewingRow] = useState<WebTransaction | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WebTransaction | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>(defaultDraft);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pagedRows = useMemo(
    () => sliceForPage(rows, pagination.page, pagination.pageSize),
    [rows, pagination.page, pagination.pageSize]
  );

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

  function openView(row: WebTransaction) {
    setOpenActionMenuId(null);
    setViewingRow(row);
  }

  function openDelete(row: WebTransaction) {
    setOpenActionMenuId(null);
    setPendingDelete(row);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteSubmitting(true);
    setMessage(null);
    try {
      const response = await secureFetch(`/api/web-transactions?id=${pendingDelete.id}`, { method: "DELETE" });
      if (handleUnauthorizedResponse(response)) {
        setPendingDelete(null);
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Failed to delete web transaction.");
        setPendingDelete(null);
        return;
      }
      setMessage("Web transaction deleted.");
      setPendingDelete(null);
      router.refresh();
    } catch {
      setMessage("Failed to delete web transaction due to a network error.");
      setPendingDelete(null);
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function submitCreate() {
    if (!createDraft.externalTxnNo.trim()) {
      setMessage("Transaction number is required.");
      return;
    }
    if (!createDraft.canonicalStatus.trim() || !createDraft.canonicalType.trim()) {
      setMessage("Status and type are required.");
      return;
    }
    if (!createDraft.createTime || !createDraft.lastUpdateTime) {
      setMessage("Create time and last update time are required.");
      return;
    }
    const amount = parseNumberInput(createDraft.amount, Number.NaN);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Amount must be greater than 0.");
      return;
    }

    setCreateSubmitting(true);
    setMessage(null);
    try {
      const response = await secureFetch("/api/web-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceSystem,
          externalTxnNo: createDraft.externalTxnNo,
          canonicalStatus: createDraft.canonicalStatus,
          canonicalType: createDraft.canonicalType,
          amount,
          merchantFee: createDraft.merchantFee.trim() ? parseNumberInput(createDraft.merchantFee, 0) : null,
          merchantName: createDraft.merchantName.trim() || null,
          createTime: new Date(createDraft.createTime).toISOString(),
          lastUpdateTime: new Date(createDraft.lastUpdateTime).toISOString()
        })
      });

      if (handleUnauthorizedResponse(response)) {
        setCreateOpen(false);
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Failed to create web transaction.");
        return;
      }
      setCreateOpen(false);
      setCreateDraft(defaultDraft());
      setMessage("Web transaction created.");
      router.refresh();
    } catch {
      setMessage("Failed to create web transaction due to a network error.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  const hasActions = canManage;
  const emptyColSpan = hasActions ? 10 : 9;

  return (
    <>
      {canManage ? (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setMessage(null);
              setCreateDraft(defaultDraft());
              setCreateOpen(true);
            }}
          >
            Create Web Transaction
          </button>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
            <tr>
              <th className="px-3 py-2">Create Time</th>
              <th className="px-3 py-2">Transaction No</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Fee</th>
              <th className="px-3 py-2">Net Amount</th>
              <th className="px-3 py-2">Merchant</th>
              <th className="px-3 py-2">Last Update</th>
              {hasActions ? <th className="px-3 py-2">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row) => {
              const netAmount = row.amount - Math.abs(row.merchant_fee ?? 0);
              return (
                <tr key={row.id} className="border-b border-[rgb(var(--border))]">
                  <td className="px-3 py-2">{formatDateTimeDisplay(row.create_time)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.external_txn_no}</td>
                  <td className="px-3 py-2">{row.canonical_status}</td>
                  <td className={`px-3 py-2 font-medium ${getTypeColorClass(row.canonical_type)}`}>{row.canonical_type}</td>
                  <td className={`px-3 py-2 font-medium ${getTypeAmountColorClass(row.canonical_type, row.amount)}`}>
                    {row.currency_code} {formatAmount(row.amount, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  </td>
                  <td className="px-3 py-2 font-medium text-rose-600">
                    {row.merchant_fee === null
                      ? "-"
                      : formatAmount(row.merchant_fee, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  </td>
                  <td className={`px-3 py-2 font-medium ${getTypeAmountColorClass(row.canonical_type, netAmount)}`}>
                    {row.currency_code}{" "}
                    {formatAmount(netAmount, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  </td>
                  <td className="px-3 py-2">{row.merchant_name ?? "-"}</td>
                  <td className="px-3 py-2">{formatDateTimeDisplay(row.last_update_time)}</td>
                  {hasActions ? (
                    <td className="px-3 py-2">
                      <div className="relative" ref={openActionMenuId === row.id ? actionMenuRef : null}>
                        <button
                          className="btn-secondary btn-sm"
                          aria-label="Open actions menu"
                          aria-expanded={openActionMenuId === row.id}
                          aria-haspopup="menu"
                          onClick={() => setOpenActionMenuId((prev) => (prev === row.id ? null : row.id))}
                        >
                          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
                            <circle cx="8" cy="3" r="1.25" />
                            <circle cx="8" cy="8" r="1.25" />
                            <circle cx="8" cy="13" r="1.25" />
                          </svg>
                        </button>
                        {openActionMenuId === row.id ? (
                          <div
                            role="menu"
                            className="absolute right-0 z-10 mt-1 w-32 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-1 shadow-sm"
                          >
                            <button
                              role="menuitem"
                              className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-[rgb(var(--surface-muted))]"
                              onClick={() => openView(row)}
                            >
                              View
                            </button>
                            <button
                              role="menuitem"
                              className="block w-full rounded px-2 py-1 text-left text-sm text-rose-600 hover:bg-[rgb(var(--surface-muted))]"
                              onClick={() => openDelete(row)}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td className="px-3 py-4 text-center text-muted" colSpan={emptyColSpan}>
                  No web transactions match current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <TablePaginationBar
        totalCount={rows.length}
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

      <Modal
        open={Boolean(viewingRow)}
        onOpenChange={(open) => {
          if (!open) setViewingRow(null);
        }}
        title="Web transaction details"
        footer={
          <button type="button" className="btn-secondary" onClick={() => setViewingRow(null)}>
            Close
          </button>
        }
      >
        {viewingRow ? (
          <div className="space-y-4 text-[rgb(var(--text))]">
            <section className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[rgb(var(--surface))] px-2 py-1 text-xs font-medium">
                  {viewingRow.source_system === "backoffice" ? "Backoffice" : "Payment Gateway"}
                </span>
                <span className="rounded-full border border-[rgb(var(--border))] px-2 py-1 text-xs">
                  {viewingRow.canonical_status}
                </span>
                <span className="rounded-full border border-[rgb(var(--border))] px-2 py-1 text-xs">
                  {viewingRow.canonical_type}
                </span>
              </div>
              <p className="text-xs text-[rgb(var(--text-muted))]">Transaction Number</p>
              <p className="mt-1 break-all font-mono text-sm">{viewingRow.external_txn_no}</p>
            </section>

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <article className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-3">
                <p className="text-xs text-[rgb(var(--text-muted))]">Amount</p>
                <p className={`mt-1 text-sm font-semibold ${getAmountColorClass(viewingRow.amount)}`}>
                  {viewingRow.currency_code}{" "}
                  {formatAmount(viewingRow.amount, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                </p>
              </article>
              <article className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-3">
                <p className="text-xs text-[rgb(var(--text-muted))]">Fee</p>
                <p
                  className={`mt-1 text-sm font-semibold ${
                    viewingRow.merchant_fee === null ? "" : getAmountColorClass(viewingRow.merchant_fee)
                  }`}
                >
                  {viewingRow.merchant_fee === null
                    ? "-"
                    : formatAmount(viewingRow.merchant_fee, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                </p>
              </article>
              <article className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-3">
                <p className="text-xs text-[rgb(var(--text-muted))]">Net Amount</p>
                <p
                  className={`mt-1 text-sm font-semibold ${getAmountColorClass(
                    viewingRow.amount - Math.abs(viewingRow.merchant_fee ?? 0)
                  )}`}
                >
                  {viewingRow.currency_code}{" "}
                  {formatAmount(viewingRow.amount - Math.abs(viewingRow.merchant_fee ?? 0), {
                    minimumFractionDigits: 3,
                    maximumFractionDigits: 3
                  })}
                </p>
              </article>
            </section>

            <section className="rounded-lg border border-[rgb(var(--border))] p-3">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-[rgb(var(--text-muted))]">Merchant</dt>
                <dd>{viewingRow.merchant_name ?? "-"}</dd>
                <dt className="text-[rgb(var(--text-muted))]">Create Time</dt>
                <dd>{formatDateTimeDisplay(viewingRow.create_time)}</dd>
                <dt className="text-[rgb(var(--text-muted))]">Last Update</dt>
                <dd>{formatDateTimeDisplay(viewingRow.last_update_time)}</dd>
              </dl>
            </section>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteSubmitting) setPendingDelete(null);
        }}
        title="Delete web transaction?"
        variant="danger"
        closeOnBackdrop={false}
        confirming={deleteSubmitting}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        description={
          pendingDelete ? (
            <ul className="list-inside list-disc space-y-1 text-[rgb(var(--text-muted))]">
              <li>Transaction No: {pendingDelete.external_txn_no}</li>
              <li>Status: {pendingDelete.canonical_status}</li>
              <li>Type: {pendingDelete.canonical_type}</li>
              <li>
                Amount: {pendingDelete.currency_code}{" "}
                {formatAmount(pendingDelete.amount, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </li>
            </ul>
          ) : null
        }
      />

      <Modal
        open={createOpen}
        onOpenChange={(open) => {
          if (createSubmitting) return;
          setCreateOpen(open);
        }}
        title={`Create Web Transaction (${sourceSystem === "backoffice" ? "Backoffice" : "Payment Gateway"})`}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              disabled={createSubmitting}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </button>
            <button type="button" className="btn" disabled={createSubmitting} onClick={() => void submitCreate()}>
              {createSubmitting ? "Creating..." : "Create"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Transaction No</span>
            <input
              className="field"
              value={createDraft.externalTxnNo}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, externalTxnNo: event.target.value }))}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Status</span>
              <input
                className="field"
                value={createDraft.canonicalStatus}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, canonicalStatus: event.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Type</span>
              <input
                className="field"
                value={createDraft.canonicalType}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, canonicalType: event.target.value }))}
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Amount</span>
              <input
                className="field"
                type="number"
                step="0.001"
                value={createDraft.amount}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, amount: event.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Fee</span>
              <input
                className="field"
                type="number"
                step="0.001"
                value={createDraft.merchantFee}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, merchantFee: event.target.value }))}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Merchant</span>
            <input
              className="field"
              value={createDraft.merchantName}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, merchantName: event.target.value }))}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Create Time</span>
              <input
                className="field"
                type="datetime-local"
                value={createDraft.createTime}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, createTime: event.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Last Update Time</span>
              <input
                className="field"
                type="datetime-local"
                value={createDraft.lastUpdateTime}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, lastUpdateTime: event.target.value }))}
              />
            </label>
          </div>
        </div>
      </Modal>
    </>
  );
}
