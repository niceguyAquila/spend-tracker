"use client";

import { useCallback, useEffect, useState } from "react";
import type { BigBookEntryAuditLog } from "@/lib/types";
import { handleUnauthorizedResponse, secureFetch } from "@/lib/client/auth-fetch";
import { formatDateTimeDisplay } from "@/lib/display-format";
import { TableEmptyState } from "@/components/ui/table-empty-state";
import { TablePaginationBar } from "@/components/ui/table-pagination-bar";
import { useTablePagination } from "@/lib/table-pagination";

const ACTION_LABELS: Record<BigBookEntryAuditLog["action"], string> = {
  insert: "Created",
  update: "Updated",
  delete: "Deleted"
};

function summarizeRow(row: Record<string, unknown> | null): string {
  if (!row) return "-";
  const explanation = typeof row.explanation === "string" ? row.explanation.trim() : "";
  const amount = row.amount != null ? String(row.amount) : "";
  const currency = typeof row.currency_code === "string" ? row.currency_code : "";
  const parts = [explanation, amount && currency ? `${currency} ${amount}` : amount || currency].filter(
    Boolean
  );
  return parts.length ? parts.join(" · ") : "Record snapshot";
}

type Props = {
  active: boolean;
};

export function BigBookEntryAuditHistorySection({ active }: Props) {
  const [rows, setRows] = useState<BigBookEntryAuditLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryIdFilter, setEntryIdFilter] = useState("");
  const [appliedEntryId, setAppliedEntryId] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pagination = useTablePagination(totalCount, 50);

  const loadHistory = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(pagination.pageSize),
        offset: String(pagination.page * pagination.pageSize)
      });
      if (appliedEntryId) params.set("entry_id", appliedEntryId);
      const response = await secureFetch(`/api/big-book/entries/audit?${params.toString()}`);
      if (handleUnauthorizedResponse(response)) return;
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to load audit history.");
        return;
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotalCount(typeof data.totalCount === "number" ? data.totalCount : 0);
    } catch {
      setError("Failed to load audit history due to a network error.");
    } finally {
      setLoading(false);
    }
  }, [active, appliedEntryId, pagination.page, pagination.pageSize]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!active) {
      setExpandedId(null);
    }
  }, [active]);

  if (!active) return null;

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Ledger History</h2>
        <p className="mt-1 text-sm text-muted">
          Audit trail of create, edit, and delete actions on ledger records. Loaded only while this
          tab is open.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = entryIdFilter.trim();
          setAppliedEntryId(trimmed || undefined);
          pagination.setPage(0);
        }}
      >
        <label className="min-w-[16rem] flex-1 text-sm">
          Filter by entry ID
          <input
            className="field mt-1"
            value={entryIdFilter}
            placeholder="Optional UUID"
            onChange={(event) => setEntryIdFilter(event.target.value)}
          />
        </label>
        <button type="submit" className="btn-secondary" disabled={loading}>
          Apply
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={loading}
          onClick={() => {
            setEntryIdFilter("");
            setAppliedEntryId(undefined);
            pagination.setPage(0);
          }}
        >
          Clear
        </button>
      </form>

      {error ? <p className="text-sm text-[rgb(var(--danger))]">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="data-table w-full table-fixed">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left">When</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">Changed by</th>
              <th className="px-3 py-2 text-left">Entry</th>
              <th className="px-3 py-2 text-left">Summary</th>
              <th className="px-3 py-2 text-left">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`audit-skeleton-${index}`} className="animate-pulse">
                    <td className="px-3 py-2" colSpan={6}>
                      <div className="h-4 w-full rounded bg-[rgb(var(--surface-muted))]" />
                    </td>
                  </tr>
                ))
              : null}
            {!loading && !rows.length ? (
              <TableEmptyState colSpan={6} message="No audit history found." />
            ) : null}
            {!loading
              ? rows.map((row) => {
                  const summarySource = row.action === "delete" ? row.old_row : row.new_row;
                  const expanded = expandedId === row.id;
                  return (
                    <tr key={row.id} className="border-b border-[rgb(var(--border))] align-top">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDateTimeDisplay(row.changed_at)}
                      </td>
                      <td className="px-3 py-2">{ACTION_LABELS[row.action]}</td>
                      <td className="px-3 py-2 break-words">{row.changer_display_name}</td>
                      <td className="px-3 py-2 font-mono text-xs break-all">{row.entry_id}</td>
                      <td className="px-3 py-2 break-words text-sm">{summarizeRow(summarySource)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-xs text-[rgb(var(--info))] underline"
                          onClick={() => setExpandedId(expanded ? null : row.id)}
                        >
                          {expanded ? "Hide" : "View JSON"}
                        </button>
                        {expanded ? (
                          <pre className="mt-2 max-h-56 overflow-auto rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))] p-2 text-[11px] leading-snug">
                            {JSON.stringify(
                              { old_row: row.old_row, new_row: row.new_row },
                              null,
                              2
                            )}
                          </pre>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>

      <TablePaginationBar
        totalCount={totalCount}
        page={pagination.page}
        setPage={pagination.setPage}
        pageSize={pagination.pageSize}
        setPageSize={pagination.setPageSize}
        pageCount={pagination.pageCount}
        rangeLabel={pagination.rangeLabel}
      />
    </section>
  );
}
