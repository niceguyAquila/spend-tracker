"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import { formatAmount, formatDateDisplay } from "@/lib/display-format";
import type { RevertPlanEntry, SettlementRevertPlan } from "@/lib/big-book/ledger-undo";
import type { SettlementUndoCandidate } from "@/lib/big-book/settlement-undo-candidates";

type Props = {
  open: boolean;
  candidates: SettlementUndoCandidate[];
  onClose: () => void;
  onReverted: (message: string) => void;
};

function entryLine(row: RevertPlanEntry) {
  return `${formatDateDisplay(row.entry_date)} · ${row.explanation} · ${formatAmount(Math.abs(row.amount))} ${row.currency_code}`;
}

function refQuery(ref: SettlementUndoCandidate["ref"]) {
  return "request_id" in ref ? `request_id=${ref.request_id}` : `payment_id=${ref.payment_id}`;
}

export function BigBookSettlementUndoDialog({ open, candidates, onClose, onReverted }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [plan, setPlan] = useState<SettlementRevertPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selected = candidates.find((candidate) => candidate.key === selectedKey) ?? null;

  useEffect(() => {
    if (!open) return;
    setSelectedKey(candidates[0]?.key ?? null);
    setReason("");
    setError(null);
    setPlan(null);
    // Re-initialize only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const candidate = candidates.find((item) => item.key === selectedKey);
    if (!open || !candidate) return;
    let cancelled = false;
    setLoading(true);
    setPlan(null);
    setError(null);
    void (async () => {
      try {
        const response = await secureFetch(`/api/big-book/settlements/revert?${refQuery(candidate.ref)}`);
        if (handleUnauthorizedResponse(response)) return;
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(typeof data.error === "string" ? data.error : "Failed to load the settlement.");
          return;
        }
        setPlan(data.plan as SettlementRevertPlan);
      } catch {
        if (!cancelled) setError("Failed to load the settlement due to a network error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `candidates` is captured when the dialog opens; refetch only on selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedKey]);

  async function confirmUndo() {
    if (!selected || !plan) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await secureFetch("/api/big-book/settlements/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...selected.ref,
          expected_entry_ids: plan.entry_ids,
          reason: reason.trim()
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to undo settlement.");
        return;
      }
      const reopened = Array.isArray(data.reopened_ids) ? data.reopened_ids.length : 0;
      const noun = plan.kind === "debt" ? "debt payment" : "settlement";
      onReverted(
        reopened
          ? `${noun[0].toUpperCase()}${noun.slice(1)} undone. ${reopened} ${plan.kind === "debt" ? "debt" : "credit"}${reopened === 1 ? "" : "s"} reopened.`
          : `${noun[0].toUpperCase()}${noun.slice(1)} undone.`
      );
    } catch {
      setError("Failed to undo settlement due to a network error.");
    } finally {
      setSubmitting(false);
    }
  }

  const kindLabel = plan?.kind === "debt" ? "debt" : "credit";
  const reopenCount = plan?.obligations.filter((row) => row.reopen).length ?? 0;
  const regroupRows = plan?.obligations.filter((row) => row.restore_group) ?? [];

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onClose();
      }}
      title={plan?.kind === "debt" ? "Undo debt payment?" : "Undo settlement?"}
      size="lg"
      closeOnBackdrop={false}
      dismissible={!submitting}
      footer={
        <>
          <button type="button" className="btn-secondary" disabled={submitting} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-[rgb(var(--danger))] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting || loading || !plan}
            onClick={() => void confirmUndo()}
          >
            {submitting ? "Please wait…" : "Undo settlement"}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {candidates.length > 1 ? (
          <label className="block space-y-1">
            <span className="font-medium">Settlement to undo</span>
            <select
              className="field"
              value={selectedKey ?? ""}
              disabled={submitting}
              onChange={(event) => setSelectedKey(event.target.value)}
            >
              {candidates.map((candidate) => (
                <option key={candidate.key} value={candidate.key}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {loading ? <p className="text-muted">Loading settlement…</p> : null}

        {plan ? (
          <>
            <div>
              <p className="font-medium">These records will be permanently removed:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {plan.payments.map((row) => (
                  <li key={row.id}>
                    {plan.kind === "debt" ? "Payment" : "Settlement"}: {entryLine(row)}
                  </li>
                ))}
                {plan.companions.map((row) => (
                  <li key={row.id}>{entryLine(row)}</li>
                ))}
              </ul>
            </div>

            {plan.obligations.length ? (
              <div>
                <p className="font-medium">
                  {kindLabel === "debt" ? "Debts" : "Credits"} affected
                  {reopenCount ? ` (${reopenCount} will be reopened)` : ""}:
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {plan.obligations.map((row) => (
                    <li key={row.id}>
                      {formatDateDisplay(row.entry_date)} · {row.explanation} ·{" "}
                      {formatAmount(Math.abs(row.amount))} {row.currency_code}
                      {row.is_future_credit ? " · Future Credit" : ""}
                      {row.applied_amount != null
                        ? ` · ${formatAmount(row.applied_amount)} ${row.currency_code} returns to open balance`
                        : ""}
                      {row.reopen ? " · reopened" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {regroupRows.length ? (
              <div>
                <p className="font-medium">Grouping restored:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {regroupRows.map((row) => (
                    <li key={row.id}>
                      {row.explanation} →{" "}
                      {row.restore_group_id ? `back to group "${row.restore_group_label ?? ""}"` : "standalone"}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {plan.group?.delete_after_revert ? (
              <p>The group &quot;{plan.group.label}&quot; was created by this settlement and will be removed.</p>
            ) : null}

            {plan.legacy ? (
              <p className="text-[rgb(var(--warning))]">
                This payment was recorded before settlement tracking. Only the payment is removed; reopen the{" "}
                {kindLabel} manually if it was marked settled.
              </p>
            ) : null}

            <label className="block space-y-1">
              <span className="font-medium">Reason (optional)</span>
              <textarea
                className="field"
                rows={2}
                maxLength={500}
                value={reason}
                disabled={submitting}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. wrong amount, paid to the wrong vendor"
              />
            </label>
          </>
        ) : null}

        {error ? <p className="text-[rgb(var(--danger))]">{error}</p> : null}
      </div>
    </Modal>
  );
}
