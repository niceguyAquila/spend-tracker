"use client";

import { useId, useState, type ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  /** When true, section can collapse/expand via the header button. */
  collapsible?: boolean;
  /** Initial open state when `collapsible` is true. Defaults to true. */
  defaultOpen?: boolean;
  /** Optional badge shown next to the title, e.g. "2 filled". */
  summary?: string;
  /**
   * Grid column count at breakpoints.
   * - `full` → 1 / sm:2 / xl:3 (default)
   * - `nested` → 1 / sm:2 (for use inside already-headed cards)
   */
  columns?: "full" | "nested";
  /** When false, skip the title header and render only the grid (used by nested layout). */
  showHeader?: boolean;
};

export function FormSection({
  title,
  children,
  collapsible = false,
  defaultOpen = true,
  summary,
  columns = "full",
  showHeader = true
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  const isOpen = collapsible ? open : true;
  const gridClass =
    columns === "nested"
      ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
      : "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <section className="space-y-3">
      {showHeader ? (
        collapsible ? (
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left"
            aria-expanded={isOpen}
            aria-controls={contentId}
            onClick={() => setOpen((prev) => !prev)}
          >
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[rgb(var(--text))]">{title}</span>
              {summary ? (
                <span className="rounded-full bg-[rgb(var(--surface-muted))] px-2 py-0.5 text-xs text-muted">
                  {summary}
                </span>
              ) : null}
            </span>
            <span
              className={`text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
              aria-hidden
            >
              ▾
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[rgb(var(--text))]">{title}</h3>
            {summary ? (
              <span className="rounded-full bg-[rgb(var(--surface-muted))] px-2 py-0.5 text-xs text-muted">
                {summary}
              </span>
            ) : null}
          </div>
        )
      ) : null}

      {isOpen ? (
        <div id={contentId} className={gridClass}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
