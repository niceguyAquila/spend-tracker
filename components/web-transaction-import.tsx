"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { handleUnauthorizedResponse } from "@/lib/client/auth-fetch";

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

    const response = await fetch("/api/web-transactions/import", {
      method: "POST",
      body: formData
    });
    if (handleUnauthorizedResponse(response)) {
      setSubmitting(false);
      return;
    }
    const data = (await response.json()) as ImportResponse;
    setSubmitting(false);

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
  }

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Daily CSV Import</h2>
        <p className="text-sm text-slate-600">
          Upload {sourceLabel} CSV. Duplicate transaction numbers are updated per source and brand.
        </p>
      </div>
      {canImport ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="field max-w-md"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <button className="btn" disabled={submitting || !file} onClick={() => void handleImport()}>
            {submitting ? "Importing..." : "Import CSV"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-amber-700">Viewer role can view data, but only finance/admin can import files.</p>
      )}
      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
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
