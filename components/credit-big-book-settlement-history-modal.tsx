"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { CreditBookEntry, CreditBookSettlement } from "@/lib/types";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import { formatAmount, formatDateDisplay } from "@/lib/display-format";

type Props = {
  entry: CreditBookEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
};

export function CreditBigBookSettlementHistoryModal({ entry, open, onOpenChange, onChanged }: Props) {
  const [settlements, setSettlements] = useState<CreditBookSettlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteSettlementId, setPendingDeleteSettlementId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingAttachmentId, setViewingAttachmentId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!entry) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/credit-big-book/settlements?entryId=${encodeURIComponent(entry.id)}`
      );
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Failed to load settlements.");
        setSettlements([]);
        return;
      }
      setSettlements(Array.isArray(data?.settlements) ? data.settlements : []);
    } catch {
      setError("Failed to load settlements due to a network error.");
    } finally {
      setLoading(false);
    }
  }, [entry]);

  useEffect(() => {
    if (open && entry) {
      void reload();
    } else if (!open) {
      setSettlements([]);
      setError(null);
    }
  }, [open, entry, reload]);

  async function viewAttachment(attachmentId: string) {
    setViewingAttachmentId(attachmentId);
    setError(null);
    try {
      const response = await fetch(
        `/api/credit-big-book/settlements/attachments/view?id=${attachmentId}`
      );
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok || !data.url) {
        setError(data?.error ?? "Failed to load attachment preview.");
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Failed to open attachment due to a network error.");
    } finally {
      setViewingAttachmentId(null);
    }
  }

  async function deleteSettlement() {
    if (!pendingDeleteSettlementId) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await secureFetch(
        `/api/credit-big-book/settlements?id=${pendingDeleteSettlementId}`,
        { method: "DELETE" }
      );
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Failed to delete settlement.");
        return;
      }
      setPendingDeleteSettlementId(null);
      await reload();
      onChanged();
    } catch {
      setError("Failed to delete settlement due to a network error.");
    } finally {
      setDeleting(false);
    }
  }

  if (!entry) return null;

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!deleting) onOpenChange(next);
        }}
        title="Settlement History"
        dismissible={!deleting}
        closeOnBackdrop={!deleting}
        footer={
          <button className="btn-secondary" disabled={deleting} onClick={() => onOpenChange(false)}>
            Close
          </button>
        }
      >
        <div className="space-y-3">
          <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-3 text-xs">
            <p>
              <span className="font-medium">{formatDateDisplay(entry.entry_date)}</span> ·{" "}
              {entry.type_name} · {entry.actor_display_name}
            </p>
            <p className="mt-1 text-[rgb(var(--text-muted))]">{entry.explanation}</p>
            <p className="mt-2">
              Original {entry.currency_code}{" "}
              {formatAmount(entry.amount, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              <span className="mx-2">·</span>
              Settled {entry.currency_code}{" "}
              {formatAmount(entry.total_settled, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4
              })}
              <span className="mx-2">·</span>
              Outstanding {entry.currency_code}{" "}
              {formatAmount(entry.outstanding, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4
              })}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Note</th>
                  <th className="px-3 py-2">Attachments</th>
                  <th className="px-3 py-2">By</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-3 py-3 text-center text-slate-600" colSpan={6}>
                      Loading...
                    </td>
                  </tr>
                ) : settlements.length ? (
                  settlements.map((s) => {
                    const crossCurrency = s.settlement_currency_code !== entry.currency_code;
                    return (
                    <tr key={s.id} className="border-b border-[rgb(var(--border))] align-top">
                      <td className="px-3 py-2">{formatDateDisplay(s.settlement_date)}</td>
                      <td className="px-3 py-2">
                        <div>
                          {s.settlement_currency_code}{" "}
                          {formatAmount(s.amount, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 4
                          })}
                        </div>
                        {crossCurrency ? (
                          <div className="mt-1 text-xs text-[rgb(var(--text-muted))]">
                            ~ {entry.currency_code}{" "}
                            {formatAmount(s.amount_in_entry_currency, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 4
                            })}{" "}
                            (1 {s.settlement_currency_code} ={" "}
                            {formatAmount(s.conversion_rate, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 8
                            })}{" "}
                            {entry.currency_code})
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {s.note ? (
                          <span className="block max-w-[260px] truncate" title={s.note}>
                            {s.note}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {s.attachments.length ? (
                          <ul className="space-y-1">
                            {s.attachments.map((attachment) => (
                              <li key={attachment.id}>
                                <button
                                  className="text-xs text-blue-700 underline"
                                  onClick={() => void viewAttachment(attachment.id)}
                                  disabled={viewingAttachmentId === attachment.id}
                                >
                                  {viewingAttachmentId === attachment.id
                                    ? "Loading..."
                                    : attachment.file_name}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{s.creator_display_name}</td>
                      <td className="px-3 py-2">
                        <button
                          className="text-xs text-rose-600 underline"
                          onClick={() => setPendingDeleteSettlementId(s.id)}
                          disabled={deleting}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-3 py-3 text-center text-slate-600" colSpan={6}>
                      No settlements recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDeleteSettlementId)}
        onOpenChange={(next) => {
          if (!next && !deleting) setPendingDeleteSettlementId(null);
        }}
        title="Delete settlement?"
        description="This will permanently remove this settlement and any attached files. The remaining outstanding balance for this entry will increase accordingly."
        confirmLabel="Delete"
        confirming={deleting}
        variant="danger"
        closeOnBackdrop={false}
        onConfirm={deleteSettlement}
      />
    </>
  );
}
