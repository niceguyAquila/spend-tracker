"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { handleUnauthorizedResponse } from "@/lib/client/auth-fetch";
import { BlockingOverlay } from "@/components/ui/blocking-overlay";

type Props = {
  canImport: boolean;
  sourceSystem: "backoffice" | "payment_gateway";
  sourceLabel: string;
};

type ImportResponse = {
  ok?: boolean;
  processed?: number;
  total_rows?: number;
  skipped_or_invalid?: number;
  errors?: string[];
  error?: string;
  details?: string[];
};

export function WebTransactionImport({ canImport, sourceSystem, sourceLabel }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleImport() {
    if (!file) {
      setMessage("Choose a CSV file first.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    setErrors([]);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("sourceSystem", sourceSystem);

    try {
      const response = await fetch("/api/web-transactions/import", {
        method: "POST",
        body: formData
      });
      if (handleUnauthorizedResponse(response)) {
        return;
      }
      const data = (await response.json()) as ImportResponse;
      if (!response.ok) {
        setMessage(data.error ?? "Import failed.");
        setErrors(data.details ?? data.errors ?? []);
        return;
      }

      setMessage(
        `Imported ${data.processed ?? 0} rows from ${data.total_rows ?? 0} valid rows. ` +
          `Skipped/invalid: ${data.skipped_or_invalid ?? 0}.`
      );
      setErrors(data.errors ?? []);
      setFile(null);
      router.refresh();
    } catch {
      setMessage("Import failed due to a network error. Please try again.");
      setErrors([]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card relative space-y-3" aria-busy={submitting}>
      <BlockingOverlay active={submitting} label="Uploading and processing CSV..." />
      <div>
        <h2 className="text-lg font-semibold">Daily CSV Import</h2>
        <p className="text-sm text-muted">
          Upload {sourceLabel} CSV. Duplicate transaction numbers are updated per source and brand.
        </p>
      </div>
      {canImport ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="field max-w-md"
            type="file"
            accept=".csv,text/csv"
            disabled={submitting}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <button className="btn" disabled={submitting || !file} onClick={() => void handleImport()}>
            {submitting ? "Importing..." : "Import CSV"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Viewer role can view data, but only finance/admin can import files.
        </p>
      )}
      {submitting ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">Uploading and processing...</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--surface-muted))]" aria-hidden>
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[rgb(var(--primary))]" />
          </div>
        </div>
      ) : null}
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {errors.length ? (
        <ul className="list-inside list-disc space-y-1 text-xs text-rose-700">
          {errors.slice(0, 10).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
