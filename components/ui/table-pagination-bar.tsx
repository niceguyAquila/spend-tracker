"use client";

import { PAGE_SIZE_OPTIONS, type PageSize } from "@/lib/table-pagination";

type TablePaginationBarProps = {
  totalCount: number;
  page: number;
  setPage: (page: number) => void;
  pageSize: PageSize;
  setPageSize: (size: PageSize) => void;
  pageCount: number;
  /** Right-side “Showing …” text; for non-tabular UIs the parent can override the label. */
  rangeLabel: string;
  className?: string;
  /** If false, the bar is hidden. Defaults to `totalCount > 0` when not set. */
  show?: boolean;
};

export function TablePaginationBar({
  totalCount,
  page,
  setPage,
  pageSize,
  setPageSize,
  pageCount,
  rangeLabel,
  className = "",
  show
}: TablePaginationBarProps) {
  if (show === false || (show === undefined && totalCount === 0)) {
    return null;
  }

  const canGoPrev = page > 0;
  const canGoNext = pageCount > 0 && page < pageCount - 1;

  return (
    <div
      className={`mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <p className="text-sm text-slate-600">{rangeLabel}</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <span>Rows</span>
          <select
            className="field w-auto min-w-[4.5rem] py-1.5 text-sm"
            value={pageSize}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n === 20 || n === 50 || n === 100 || n === 200) {
                setPageSize(n);
              }
            }}
            aria-label="Rows per page"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-1.5 text-sm font-medium text-slate-800 enabled:hover:bg-[rgb(var(--surface-muted))] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canGoPrev}
            onClick={() => setPage(page - 1)}
            aria-label="Previous page"
          >
            Previous
          </button>
          <span className="px-1 text-sm text-slate-600" aria-live="polite">
            Page {pageCount ? page + 1 : 0} of {pageCount}
          </span>
          <button
            type="button"
            className="rounded border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-1.5 text-sm font-medium text-slate-800 enabled:hover:bg-[rgb(var(--surface-muted))] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canGoNext}
            onClick={() => setPage(page + 1)}
            aria-label="Next page"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
