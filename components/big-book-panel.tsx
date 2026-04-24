"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BigBookActor, BigBookActorCurrencyMetrics, BigBookEntry, BigBookLedgerType } from "@/lib/types";
import { handleUnauthorizedResponse } from "@/lib/client/auth-fetch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BlockingOverlay } from "@/components/ui/blocking-overlay";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { Modal } from "@/components/ui/modal";
import { formatAmount, formatDateDisplay, getAmountColorClass } from "@/lib/display-format";

type Props = {
  initialTypes: BigBookLedgerType[];
  initialActors: BigBookActor[];
  initialEntries: BigBookEntry[];
  initialActorMetrics: BigBookActorCurrencyMetrics[];
};

type EntryFormState = {
  entry_date: string;
  entry_direction: "spending" | "profit";
  entry_type_id: string;
  explanation: string;
  amount: string;
  currency_code: "IDR" | "MYR" | "USDT" | "TRX";
  remark: string;
  responsible_actor_id: string;
};

type ApiErrorShape = {
  formErrors?: unknown;
  fieldErrors?: Record<string, unknown>;
};

type CreateEntryMode = "create" | "create_another";

const amountFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4
});

function parseAmountInput(value: string) {
  return value.replace(/,/g, "");
}

function formatAmountInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const [integerPartRaw, ...decimalParts] = cleaned.split(".");
  const integerPart = integerPartRaw.replace(/^0+(?=\d)/, "") || "0";
  const decimalPart = decimalParts.join("").slice(0, 4);
  const formattedInteger = amountFormatter.format(Number(integerPart));
  if (cleaned.endsWith(".") && decimalPart.length === 0) {
    return `${formattedInteger}.`;
  }
  return decimalPart.length > 0 ? `${formattedInteger}.${decimalPart}` : formattedInteger;
}

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

export function BigBookPanel({ initialTypes, initialActors, initialEntries, initialActorMetrics }: Props) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [openActionMenu, setOpenActionMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [pendingEntryConfirm, setPendingEntryConfirm] = useState(false);
  const [createEntryMode, setCreateEntryMode] = useState<CreateEntryMode>("create");
  const [createAttachmentFiles, setCreateAttachmentFiles] = useState<File[]>([]);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [pendingEditConfirm, setPendingEditConfirm] = useState(false);
  const [editForm, setEditForm] = useState<EntryFormState>({
    entry_date: "",
    entry_direction: "spending",
    entry_type_id: "",
    explanation: "",
    amount: "",
    currency_code: "IDR",
    remark: "",
    responsible_actor_id: ""
  });
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<BigBookEntry | null>(null);
  const [entryDeleting, setEntryDeleting] = useState(false);
  const [manageAttachmentsEntry, setManageAttachmentsEntry] = useState<BigBookEntry | null>(null);
  const [manageAttachmentFiles, setManageAttachmentFiles] = useState<File[]>([]);
  const [pendingUploadEntryId, setPendingUploadEntryId] = useState<string | null>(null);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [attachmentViewingId, setAttachmentViewingId] = useState<string | null>(null);
  const [pendingDeleteAttachmentId, setPendingDeleteAttachmentId] = useState<string | null>(null);
  const [attachmentDeleting, setAttachmentDeleting] = useState(false);
  const [viewingRemark, setViewingRemark] = useState<{ entryId: string; text: string } | null>(null);

  const activeTypes = useMemo(() => initialTypes.filter((item) => item.is_active), [initialTypes]);
  const currencies: Array<"IDR" | "MYR" | "USDT" | "TRX"> = ["IDR", "MYR", "USDT", "TRX"];
  const today = new Date().toISOString().slice(0, 10);

  const [entryForm, setEntryForm] = useState<EntryFormState>({
    entry_date: today,
    entry_direction: "spending",
    entry_type_id: activeTypes[0]?.id ?? initialTypes[0]?.id ?? "",
    explanation: "",
    amount: "",
    currency_code: "IDR",
    remark: "",
    responsible_actor_id: initialActors[0]?.id ?? ""
  });

  const visibleEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return initialEntries.filter((row) => {
      if (dateFrom && row.entry_date < dateFrom) return false;
      if (dateTo && row.entry_date > dateTo) return false;
      if (typeFilter && row.entry_type_id !== typeFilter) return false;
      if (currencyFilter && row.currency_code !== currencyFilter) return false;
      if (actorFilter && row.responsible_actor_id !== actorFilter) return false;
      if (directionFilter && row.entry_direction !== directionFilter) return false;
      if (!normalized) return true;
      return [row.explanation, row.remark ?? "", row.type_name, row.actor_display_name].join(" ").toLowerCase().includes(normalized);
    });
  }, [initialEntries, query, dateFrom, dateTo, typeFilter, currencyFilter, actorFilter, directionFilter]);

  const criticalPending =
    entrySubmitting ||
    entryDeleting ||
    uploadSubmitting ||
    attachmentDeleting;

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!openActionMenu) return;
      if (actionMenuRef.current && event.target instanceof Node && !actionMenuRef.current.contains(event.target)) {
        setOpenActionMenu(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenActionMenu(null);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openActionMenu]);

  function triggerRefresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function createEntry() {
    const amountValue = Number(parseAmountInput(entryForm.amount));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }

    setEntrySubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/big-book/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...entryForm,
          amount: amountValue
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to create ledger entry."));
        return;
      }

      const createdEntryId = data.id as string;
      if (createAttachmentFiles.length > 0) {
        for (const file of createAttachmentFiles) {
          const formData = new FormData();
          formData.append("ledger_entry_id", createdEntryId);
          formData.append("file", file);
          const uploadResponse = await fetch("/api/big-book/attachments", {
            method: "POST",
            body: formData
          });
          if (handleUnauthorizedResponse(uploadResponse)) return;
          const uploadData = await uploadResponse.json();
          if (!uploadResponse.ok) {
            setError(extractApiError(uploadData.error, `Entry created, but failed to upload ${file.name}.`));
            setPendingEntryConfirm(false);
            setCreateModalOpen(false);
            triggerRefresh();
            return;
          }
        }
      }

      const keepModalOpen = createEntryMode === "create_another";
      setMessage("Ledger entry created.");
      setPendingEntryConfirm(false);
      setCreateModalOpen(keepModalOpen);
      setCreateAttachmentFiles([]);
      setEntryForm((prev) => ({
        ...prev,
        explanation: "",
        amount: "",
        remark: "",
        ...(keepModalOpen ? {} : { currency_code: "IDR" })
      }));
      triggerRefresh();
    } catch {
      setError("Failed to create ledger entry due to a network error.");
    } finally {
      setEntrySubmitting(false);
    }
  }

  async function deleteEntry() {
    if (!pendingDeleteEntry) return;
    setEntryDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/big-book/entries?id=${pendingDeleteEntry.id}`, { method: "DELETE" });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Failed to delete ledger entry.");
        return;
      }
      setMessage("Ledger entry deleted.");
      setPendingDeleteEntry(null);
      triggerRefresh();
    } catch {
      setError("Failed to delete ledger entry due to a network error.");
    } finally {
      setEntryDeleting(false);
    }
  }

  function startEditEntry(row: BigBookEntry) {
    setOpenActionMenu(null);
    setEditingEntryId(row.id);
    setEditForm({
      entry_date: row.entry_date,
      entry_direction: row.entry_direction,
      entry_type_id: row.entry_type_id,
      explanation: row.explanation,
      amount: formatAmountInput(String(row.amount)),
      currency_code: row.currency_code,
      remark: row.remark ?? "",
      responsible_actor_id: row.responsible_actor_id
    });
    setEditModalOpen(true);
  }

  async function saveEditedEntry() {
    if (!editingEntryId) return;
    const amountValue = Number(parseAmountInput(editForm.amount));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }

    setEntrySubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/big-book/entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEntryId,
          ...editForm,
          amount: amountValue
        })
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(extractApiError(data.error, "Failed to update ledger entry."));
        return;
      }
      setMessage("Ledger entry updated.");
      setPendingEditConfirm(false);
      setEditModalOpen(false);
      setEditingEntryId(null);
      triggerRefresh();
    } catch {
      setError("Failed to update ledger entry due to a network error.");
    } finally {
      setEntrySubmitting(false);
    }
  }

  async function uploadAttachments() {
    if (!pendingUploadEntryId) return;
    const files = manageAttachmentFiles;
    if (!files.length) {
      setError("Choose one or more image files first.");
      return;
    }
    setUploadSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("ledger_entry_id", pendingUploadEntryId);
        formData.append("file", file);
        const response = await fetch("/api/big-book/attachments", {
          method: "POST",
          body: formData
        });
        if (handleUnauthorizedResponse(response)) return;
        const data = await response.json();
        if (!response.ok) {
          setError(extractApiError(data.error, `Failed to upload ${file.name}.`));
          return;
        }
      }
      setMessage("Attachment(s) uploaded.");
      setPendingUploadEntryId(null);
      setManageAttachmentFiles([]);
      triggerRefresh();
    } catch {
      setError("Failed to upload attachment due to a network error.");
    } finally {
      setUploadSubmitting(false);
    }
  }

  async function viewAttachment(attachmentId: string) {
    setAttachmentViewingId(attachmentId);
    setError(null);
    try {
      const response = await fetch(`/api/big-book/attachments/view?id=${attachmentId}`);
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok || !data.url) {
        setError(data.error ?? "Failed to load attachment preview.");
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Failed to open attachment due to a network error.");
    } finally {
      setAttachmentViewingId(null);
    }
  }

  async function deleteAttachment() {
    if (!pendingDeleteAttachmentId) return;
    setAttachmentDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/big-book/attachments?id=${pendingDeleteAttachmentId}`, {
        method: "DELETE"
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Failed to delete attachment.");
        return;
      }
      setMessage("Attachment deleted.");
      setPendingDeleteAttachmentId(null);
      triggerRefresh();
    } catch {
      setError("Failed to delete attachment due to a network error.");
    } finally {
      setAttachmentDeleting(false);
    }
  }

  function removeCreateAttachmentAt(index: number) {
    setCreateAttachmentFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }

  function openManageAttachments(row: BigBookEntry) {
    setOpenActionMenu(null);
    setManageAttachmentsEntry(row);
    setManageAttachmentFiles([]);
  }
  function toggleActionMenu(rowId: string, triggerEl: HTMLButtonElement) {
    if (openActionMenu?.id === rowId) {
      setOpenActionMenu(null);
      return;
    }
    const rect = triggerEl.getBoundingClientRect();
    const menuWidth = 176;
    const viewportPadding = 8;
    const left = Math.max(
      viewportPadding,
      Math.min(window.innerWidth - menuWidth - viewportPadding, rect.right - menuWidth)
    );
    setOpenActionMenu({
      id: rowId,
      top: rect.bottom + 6,
      left
    });
  }


  const handleCreateModalOpenChange = useCallback(
    (open: boolean) => {
      if (!entrySubmitting) {
        setCreateModalOpen(open);
      }
    },
    [entrySubmitting]
  );

  return (
    <div className="space-y-6">
      <section className="card relative" aria-busy={criticalPending}>
        <BlockingOverlay active={criticalPending} label="Processing..." />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Create Ledger Entry</h2>
            <p className="mt-1 text-sm text-slate-600">
              Add operational spending/profit records from a dedicated popup form.
            </p>
          </div>
          <button className="btn" onClick={() => setCreateModalOpen(true)} disabled={criticalPending}>
            New Ledger Entry
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Grand Total by Actor (All Time)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Total amount grouped by actor and currency across all Big Book records.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {initialActorMetrics.map((metric) => (
            <article key={metric.actor_id} className="rounded-md border border-slate-200 p-4">
              <p className="font-semibold">
                Actor {metric.actor_display_name}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-slate-50 p-2 text-slate-900">
                  <p className="text-xs uppercase text-slate-500">IDR</p>
                  <p
                    className={`font-medium ${getAmountColorClass(metric.totals.IDR)}`}
                  >
                    {formatAmount(metric.totals.IDR, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 p-2 text-slate-900">
                  <p className="text-xs uppercase text-slate-500">MYR</p>
                  <p
                    className={`font-medium ${getAmountColorClass(metric.totals.MYR)}`}
                  >
                    {formatAmount(metric.totals.MYR, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 p-2 text-slate-900">
                  <p className="text-xs uppercase text-slate-500">USDT</p>
                  <p
                    className={`font-medium ${getAmountColorClass(metric.totals.USDT)}`}
                  >
                    {formatAmount(metric.totals.USDT, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 p-2 text-slate-900">
                  <p className="text-xs uppercase text-slate-500">TRX</p>
                  <p
                    className={`font-medium ${getAmountColorClass(metric.totals.TRX)}`}
                  >
                    {formatAmount(metric.totals.TRX, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
                  </p>
                </div>
              </div>
            </article>
          ))}
          {!initialActorMetrics.length ? (
            <p className="text-sm text-slate-600">No actor totals yet.</p>
          ) : null}
        </div>
      </section>

      <section className="card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Ledger Records</h2>
          {isRefreshing ? <LoadingIndicator label="Refreshing..." /> : null}
        </div>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          <label className="text-sm text-slate-700 md:col-span-2 xl:col-span-2 2xl:col-span-2">
            <span className="mb-1 block">Search</span>
            <input
              className="field w-full"
              placeholder="Explanation, remark, type..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block">Date From:</span>
            <input
              className="field w-full"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              aria-label="Filter from date"
            />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block">Date To:</span>
            <input
              className="field w-full"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              aria-label="Filter to date"
            />
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block">Type</span>
            <select className="field w-full" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">All types</option>
              {initialTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block">Currency</span>
            <select className="field w-full" value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)}>
              <option value="">All currencies</option>
              {currencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block">Actor</span>
            <select className="field w-full" value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
              <option value="">All actors</option>
              {initialActors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block">Cash Flow</span>
            <select className="field w-full" value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value)}>
              <option value="">All directions</option>
              <option value="spending">Out</option>
              <option value="profit">In</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="border-b border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] text-left">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Cash Flow</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Explanation</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Remark</th>
                <th className="px-3 py-2">Attachments</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.map((row) => (
                <tr key={row.id} className="border-b border-[rgb(var(--border))] align-top">
                  <td className="px-3 py-2">{formatDateDisplay(row.entry_date)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                        row.entry_direction === "profit"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {row.entry_direction === "profit" ? "In" : "Out"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{row.type_name}</td>
                  <td className="px-3 py-2">{row.explanation}</td>
                  <td className="px-3 py-2">
                    <span className={getAmountColorClass(row.entry_direction === "spending" ? -row.amount : row.amount)}>
                      {row.currency_code}{" "}
                      {formatAmount(row.amount, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.actor_display_name}
                  </td>
                  <td className="px-3 py-2">
                    {row.remark ? (
                      <div className="flex max-w-[260px] items-start gap-2">
                        <span className="truncate">{row.remark}</span>
                        <button
                          className="shrink-0 text-xs text-blue-700 underline"
                          type="button"
                          onClick={() => setViewingRemark({ entryId: row.id, text: row.remark ?? "" })}
                        >
                          View
                        </button>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.attachments.length ? (
                      <div className="space-y-1">
                        <p className="text-xs text-slate-600">{row.attachments.length} file(s)</p>
                        <ul className="space-y-1">
                          {row.attachments.map((attachment) => (
                            <li key={attachment.id}>
                              <button
                                className="text-xs text-blue-700 underline"
                                onClick={() => void viewAttachment(attachment.id)}
                                disabled={attachmentViewingId === attachment.id}
                              >
                                {attachmentViewingId === attachment.id ? "Loading..." : attachment.file_name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">No files</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="relative">
                      <button
                        className="btn-secondary btn-sm"
                        aria-label="Open actions menu"
                        aria-expanded={openActionMenu?.id === row.id}
                        aria-haspopup="menu"
                        onClick={(event) => toggleActionMenu(row.id, event.currentTarget)}
                        disabled={criticalPending}
                      >
                        Actions
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!visibleEntries.length ? (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-600" colSpan={9}>
                    No records match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      {openActionMenu ? (
        <div
          ref={actionMenuRef}
          role="menu"
          className="fixed z-50 w-44 rounded-md border border-slate-200 bg-white p-1 text-slate-900 shadow-lg"
          style={{ top: openActionMenu.top, left: openActionMenu.left }}
        >
          {(() => {
            const targetRow = initialEntries.find((entry) => entry.id === openActionMenu.id);
            if (!targetRow) return null;
            return (
              <>
                <button
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100"
                  role="menuitem"
                  onClick={() => startEditEntry(targetRow)}
                >
                  Edit record
                </button>
                <button
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100"
                  role="menuitem"
                  onClick={() => openManageAttachments(targetRow)}
                >
                  Manage attachments
                </button>
                <button
                  className="block w-full rounded px-2 py-1 text-left text-sm text-rose-600 hover:bg-slate-100"
                  role="menuitem"
                  onClick={() => {
                    setOpenActionMenu(null);
                    setPendingDeleteEntry(targetRow);
                  }}
                >
                  Delete record
                </button>
              </>
            );
          })()}
        </div>
      ) : null}

      <Modal
        open={createModalOpen}
        onOpenChange={handleCreateModalOpenChange}
        title="Create Ledger Entry"
        dismissible={!entrySubmitting}
        closeOnBackdrop={!entrySubmitting}
        footer={
          <>
            <button className="btn-secondary" disabled={entrySubmitting} onClick={() => setCreateModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn"
              disabled={entrySubmitting || !entryForm.explanation.trim() || !entryForm.amount}
              onClick={() => {
                setCreateEntryMode("create");
                setPendingEntryConfirm(true);
              }}
            >
              {entrySubmitting ? "Saving..." : "Save"}
            </button>
            <button
              className="btn-secondary"
              disabled={entrySubmitting || !entryForm.explanation.trim() || !entryForm.amount}
              onClick={() => {
                setCreateEntryMode("create_another");
                setPendingEntryConfirm(true);
              }}
            >
              {entrySubmitting ? "Saving..." : "Save + Create Another"}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <label className="text-sm">
            Date *
            <input
              className="field mt-1"
              type="date"
              value={entryForm.entry_date}
              onChange={(event) => setEntryForm((prev) => ({ ...prev, entry_date: event.target.value }))}
            />
          </label>
          <label className="text-sm">
            Type *
            <select
              className="field mt-1"
              value={entryForm.entry_type_id}
              onChange={(event) => setEntryForm((prev) => ({ ...prev, entry_type_id: event.target.value }))}
            >
              {activeTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
            <label className="text-sm">
              Cash Flow *
              <select
                className="field mt-1"
                value={entryForm.entry_direction}
                onChange={(event) =>
                  setEntryForm((prev) => ({
                    ...prev,
                    entry_direction: event.target.value as "spending" | "profit"
                  }))
                }
              >
                <option value="spending">Out</option>
                <option value="profit">In</option>
              </select>
            </label>
          <label className="text-sm">
            Responsible Actor *
            <select
              className="field mt-1"
              value={entryForm.responsible_actor_id}
              onChange={(event) => setEntryForm((prev) => ({ ...prev, responsible_actor_id: event.target.value }))}
            >
              {initialActors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Currency *
            <select
              className="field mt-1"
              value={entryForm.currency_code}
              onChange={(event) =>
                setEntryForm((prev) => ({ ...prev, currency_code: event.target.value as EntryFormState["currency_code"] }))
              }
            >
              {currencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm lg:col-span-2">
            Explanation *
            <input
              className="field mt-1"
              value={entryForm.explanation}
              onChange={(event) => setEntryForm((prev) => ({ ...prev, explanation: event.target.value }))}
              placeholder="What was this spending/profit for?"
            />
          </label>
          <label className="text-sm">
            Amount *
            <input
              className="field mt-1"
              inputMode="decimal"
              placeholder="0"
              value={entryForm.amount}
              onChange={(event) =>
                setEntryForm((prev) => ({ ...prev, amount: formatAmountInput(event.target.value) }))
              }
            />
          </label>
          <label className="text-sm">
            Attachments
            <input
              className="field mt-1"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setCreateAttachmentFiles(Array.from(event.target.files ?? []))}
            />
            {createAttachmentFiles.length > 0 ? (
              <ul className="mt-2 space-y-1 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-900">
                {createAttachmentFiles.map((file, index) => (
                  <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {file.name} ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                    <button
                      type="button"
                      className="text-rose-600 underline"
                      onClick={() => removeCreateAttachmentAt(index)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </label>
          <label className="text-sm lg:col-span-2">
            Remark
            <input
              className="field mt-1"
              value={entryForm.remark}
              onChange={(event) => setEntryForm((prev) => ({ ...prev, remark: event.target.value }))}
            />
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingEntryConfirm}
        onOpenChange={setPendingEntryConfirm}
        title="Create ledger entry?"
        description={
          createAttachmentFiles.length
            ? `This will create a new record and upload ${createAttachmentFiles.length} attachment(s).`
            : "This will create a new operational/profit record in the Big Book."
        }
        confirmLabel={createEntryMode === "create_another" ? "Create & Add Another" : "Create Entry"}
        confirming={entrySubmitting}
        closeOnBackdrop={false}
        onConfirm={createEntry}
      />

      <Modal
        open={Boolean(viewingRemark)}
        onOpenChange={(open) => {
          if (!open) setViewingRemark(null);
        }}
        title="Full Remark"
        footer={
          <button className="btn-secondary" onClick={() => setViewingRemark(null)}>
            Close
          </button>
        }
      >
        <p className="whitespace-pre-wrap break-words text-sm text-muted">{viewingRemark?.text ?? ""}</p>
      </Modal>

      <Modal
        open={editModalOpen}
        onOpenChange={(open) => {
          if (!entrySubmitting) setEditModalOpen(open);
        }}
        title="Edit Ledger Entry"
        dismissible={!entrySubmitting}
        closeOnBackdrop={!entrySubmitting}
        footer={
          <>
            <button className="btn-secondary" disabled={entrySubmitting} onClick={() => setEditModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn"
              disabled={entrySubmitting || !editForm.explanation.trim() || !editForm.amount}
              onClick={() => setPendingEditConfirm(true)}
            >
              {entrySubmitting ? "Saving..." : "Continue"}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <label className="text-sm">
            Date *
            <input
              className="field mt-1"
              type="date"
              value={editForm.entry_date}
              onChange={(event) => setEditForm((prev) => ({ ...prev, entry_date: event.target.value }))}
            />
          </label>
          <label className="text-sm">
            Type *
            <select
              className="field mt-1"
              value={editForm.entry_type_id}
              onChange={(event) => setEditForm((prev) => ({ ...prev, entry_type_id: event.target.value }))}
            >
              {activeTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
            <label className="text-sm">
              Cash Flow *
              <select
                className="field mt-1"
                value={editForm.entry_direction}
                onChange={(event) =>
                  setEditForm((prev) => ({
                    ...prev,
                    entry_direction: event.target.value as "spending" | "profit"
                  }))
                }
              >
                <option value="spending">Out</option>
                <option value="profit">In</option>
              </select>
            </label>
          <label className="text-sm">
            Responsible Actor *
            <select
              className="field mt-1"
              value={editForm.responsible_actor_id}
              onChange={(event) => setEditForm((prev) => ({ ...prev, responsible_actor_id: event.target.value }))}
            >
              {initialActors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Currency *
            <select
              className="field mt-1"
              value={editForm.currency_code}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, currency_code: event.target.value as EntryFormState["currency_code"] }))
              }
            >
              {currencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm lg:col-span-2">
            Explanation *
            <input
              className="field mt-1"
              value={editForm.explanation}
              onChange={(event) => setEditForm((prev) => ({ ...prev, explanation: event.target.value }))}
            />
          </label>
          <label className="text-sm">
            Amount *
            <input
              className="field mt-1"
              inputMode="decimal"
              value={editForm.amount}
              onChange={(event) => setEditForm((prev) => ({ ...prev, amount: formatAmountInput(event.target.value) }))}
            />
          </label>
          <label className="text-sm lg:col-span-2">
            Remark
            <input
              className="field mt-1"
              value={editForm.remark}
              onChange={(event) => setEditForm((prev) => ({ ...prev, remark: event.target.value }))}
            />
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingEditConfirm}
        onOpenChange={setPendingEditConfirm}
        title="Save ledger entry changes?"
        description="This will update the selected ledger record."
        confirmLabel="Save changes"
        confirming={entrySubmitting}
        closeOnBackdrop={false}
        onConfirm={saveEditedEntry}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteEntry)}
        onOpenChange={(open) => {
          if (!open && !entryDeleting) setPendingDeleteEntry(null);
        }}
        title="Delete ledger entry?"
        description="This will permanently remove the selected entry and all its attachments."
        confirmLabel="Delete"
        confirming={entryDeleting}
        variant="danger"
        closeOnBackdrop={false}
        onConfirm={deleteEntry}
      />

      <Modal
        open={Boolean(manageAttachmentsEntry)}
        onOpenChange={(open) => {
          if (!open && !uploadSubmitting && !attachmentDeleting) {
            setManageAttachmentsEntry(null);
            setManageAttachmentFiles([]);
          }
        }}
        title="Manage Attachments"
        dismissible={!uploadSubmitting && !attachmentDeleting}
        closeOnBackdrop={!uploadSubmitting && !attachmentDeleting}
        footer={
          <>
            <button
              className="btn-secondary"
              disabled={uploadSubmitting || attachmentDeleting}
              onClick={() => {
                setManageAttachmentsEntry(null);
                setManageAttachmentFiles([]);
              }}
            >
              Close
            </button>
            <button
              className="btn"
              disabled={uploadSubmitting || !(manageAttachmentFiles.length > 0) || !manageAttachmentsEntry}
              onClick={() => setPendingUploadEntryId(manageAttachmentsEntry?.id ?? null)}
            >
              {uploadSubmitting ? "Uploading..." : "Upload selected"}
            </button>
          </>
        }
      >
        {manageAttachmentsEntry ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              {formatDateDisplay(manageAttachmentsEntry.entry_date)} · {manageAttachmentsEntry.type_name} · {manageAttachmentsEntry.explanation}
            </p>
            <input
              className="field"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setManageAttachmentFiles(Array.from(event.target.files ?? []))}
            />
            {manageAttachmentFiles.length ? (
              <ul className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-900">
                {manageAttachmentFiles.map((file, index) => (
                  <li key={`${file.name}-${file.size}-${index}`}>{file.name}</li>
                ))}
              </ul>
            ) : null}
            <ul className="space-y-2">
              {manageAttachmentsEntry.attachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-[rgb(var(--surface))] p-2"
                >
                  <button
                    className="truncate text-left text-xs text-blue-700 underline"
                    onClick={() => void viewAttachment(attachment.id)}
                    disabled={attachmentViewingId === attachment.id}
                  >
                    {attachmentViewingId === attachment.id ? "Loading..." : attachment.file_name}
                  </button>
                  <button
                    className="text-xs text-rose-600 underline"
                    onClick={() => setPendingDeleteAttachmentId(attachment.id)}
                    disabled={attachmentDeleting}
                  >
                    Delete
                  </button>
                </li>
              ))}
              {!manageAttachmentsEntry.attachments.length ? (
                <li className="text-xs text-slate-500">No attachments yet.</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingUploadEntryId)}
        onOpenChange={(open) => {
          if (!open && !uploadSubmitting) setPendingUploadEntryId(null);
        }}
        title="Upload attachment images?"
        description="Selected image files will be attached to this ledger entry."
        confirmLabel="Upload"
        confirming={uploadSubmitting}
        closeOnBackdrop={false}
        onConfirm={uploadAttachments}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteAttachmentId)}
        onOpenChange={(open) => {
          if (!open && !attachmentDeleting) setPendingDeleteAttachmentId(null);
        }}
        title="Delete attachment?"
        description="This will permanently remove the selected image."
        confirmLabel="Delete"
        confirming={attachmentDeleting}
        variant="danger"
        closeOnBackdrop={false}
        onConfirm={deleteAttachment}
      />
    </div>
  );
}
