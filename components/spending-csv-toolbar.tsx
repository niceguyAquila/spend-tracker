"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import { Modal } from "@/components/ui/modal";
import { buildSpendingImportTemplateCsv } from "@/lib/spending/csv";
import type { AppRole, SpendingCurrencyCode } from "@/lib/types";

export type SpendingCsvExportFilters = {
  month: string;
  dateFrom: string;
  dateTo: string;
  query: string;
  direction: Array<"spending" | "profit">;
  categoryId: string[];
  typeId: string[];
  staffId: string[];
  currency: SpendingCurrencyCode[];
};

type Props = {
  role: AppRole;
  filters: SpendingCsvExportFilters;
  disabled?: boolean;
};

function extractApiError(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim().length > 0) return error;
  return fallback;
}

export function SpendingCsvToolbar({ role, filters, disabled = false }: Props) {
  const router = useRouter();
  const canImport = role === "finance" || role === "admin";
  const [exportSubmitting, setExportSubmitting] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccess, setImportSuccess] = useState<{ processed: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function downloadImportTemplate() {
    const csv = buildSpendingImportTemplateCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = "spending-import-template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(downloadUrl);
  }

  async function exportEntries() {
    setExportSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      if (filters.month) params.set("month", filters.month);
      if (filters.query) params.set("query", filters.query);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      for (const value of filters.direction) params.append("direction", value);
      for (const value of filters.categoryId) params.append("categoryId", value);
      for (const value of filters.typeId) params.append("typeId", value);
      for (const value of filters.staffId) params.append("staffId", value);
      for (const value of filters.currency) params.append("currency", value);

      const url = `/api/expenses/export${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url);
      if (handleUnauthorizedResponse(response)) return;
      if (!response.ok) {
        let errorMessage = "Failed to export spending entries.";
        try {
          const data = await response.json();
          errorMessage = extractApiError(data?.error, errorMessage);
        } catch {
          // keep default
        }
        setError(errorMessage);
        return;
      }

      const blob = await response.blob();
      const today = new Date().toISOString().slice(0, 10);
      const filename = `spending-export-${today}.csv`;
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(downloadUrl);
      setMessage("Exported spending entries to CSV.");
    } catch {
      setError("Failed to export spending entries due to a network error.");
    } finally {
      setExportSubmitting(false);
    }
  }

  async function importEntries() {
    if (!importFile) {
      setError("Choose a CSV file first.");
      return;
    }

    setImportSubmitting(true);
    setError(null);
    setMessage(null);
    setImportErrors([]);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const response = await secureFetch("/api/expenses/import", {
        method: "POST",
        body: formData
      });
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        if (Array.isArray(data?.errors)) {
          const list = data.errors
            .filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
            .slice(0, 50);
          if (list.length) {
            setImportErrors(list);
            setError(data.message ?? "Import failed due to validation errors.");
            return;
          }
        }
        setError(data.error ?? data.message ?? "Failed to import CSV.");
        return;
      }

      const processed = typeof data.processed === "number" ? data.processed : 0;
      setImportFile(null);
      setImportModalOpen(false);
      setImportSuccess({ processed });
      setMessage(`Imported ${processed} row${processed === 1 ? "" : "s"} successfully.`);
      router.refresh();
    } catch {
      setError("Failed to import CSV due to a network error.");
    } finally {
      setImportSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void exportEntries()}
          disabled={disabled || exportSubmitting}
        >
          {exportSubmitting ? "Exporting..." : "Export CSV"}
        </button>
        {canImport ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setImportErrors([]);
              setError(null);
              setImportModalOpen(true);
            }}
            disabled={disabled}
          >
            Import CSV
          </button>
        ) : null}
      </div>
      {message ? (
        <p className="mt-2 text-sm text-muted" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      {error && !importModalOpen ? (
        <p className="mt-2 text-sm text-[rgb(var(--danger))]" role="alert">
          {error}
        </p>
      ) : null}

      <Modal
        open={importModalOpen}
        onOpenChange={(open) => {
          if (!open && !importSubmitting) {
            setImportModalOpen(false);
            setImportFile(null);
            setImportErrors([]);
          }
        }}
        title="Bulk Import (CSV)"
        dismissible={!importSubmitting}
        closeOnBackdrop={!importSubmitting}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              disabled={importSubmitting}
              onClick={() => {
                setImportModalOpen(false);
                setImportFile(null);
                setImportErrors([]);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void importEntries()}
              disabled={importSubmitting || !importFile}
            >
              {importSubmitting ? "Importing..." : "Import CSV"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-muted">
                Download the template, fill multiple rows, then import all at once.
              </p>
              <p className="mt-1 text-xs text-muted">
                Blank or unknown category names fall back to Uncategorized. Blank or unknown type/staff import as
                empty. Every row is imported, including rows identical to existing ones. Use cash_flow values
                spending or profit.
              </p>
              {error ? <p className="mt-2 text-sm text-[rgb(var(--danger))]">{error}</p> : null}
            </div>
            <button type="button" className="btn-secondary shrink-0" onClick={downloadImportTemplate}>
              Download Template
            </button>
          </div>
          <label className="text-sm text-muted">
            <span className="mb-1 block">CSV File</span>
            <input
              className="field"
              type="file"
              accept=".csv,text/csv"
              disabled={importSubmitting}
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                setImportFile(nextFile);
                setImportErrors([]);
              }}
            />
          </label>
          {importErrors.length ? (
            <div className="rounded-md border border-[rgb(var(--danger)/0.35)] bg-[rgb(var(--danger)/0.12)] p-3 text-sm text-[rgb(var(--danger))]">
              <p className="font-medium">Import validation errors:</p>
              <ul className="mt-1 list-disc pl-5">
                {importErrors.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={importSuccess !== null}
        onOpenChange={(open) => {
          if (!open) setImportSuccess(null);
        }}
        title="Import Completed"
        footer={
          <button type="button" className="btn" onClick={() => setImportSuccess(null)}>
            OK
          </button>
        }
      >
        <p className="text-sm text-muted">
          Imported {importSuccess?.processed ?? 0} spending row
          {(importSuccess?.processed ?? 0) === 1 ? "" : "s"}.
        </p>
      </Modal>
    </>
  );
}
