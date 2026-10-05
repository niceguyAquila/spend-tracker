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
  /**
   * Soft step panel: lightly tinted surface, left accent, and step index
   * (e.g. `"01"`) beside the title. Omit for the plain section layout.
   */
  step?: string;
};

export function FormSection({
  title,
  children,
  collapsible = false,
  defaultOpen = true,
  summary,
  columns = "full",
  showHeader = true,
  step
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  const isOpen = collapsible ? open : true;
  const gridClass =
    columns === "nested"
      ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
      : "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3";

  const titleRow = (
    <span className="flex items-center gap-2">
      {step ? (
        <span
          className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-[rgb(var(--primary)/0.12)] px-1.5 text-xs font-semibold tracking-wide text-[rgb(var(--primary))]"
          aria-hidden
        >
          {step}
        </span>
      ) : null}
      <span className="text-sm font-semibold text-[rgb(var(--text))]">{title}</span>
      {summary ? (
        <span className="rounded-full bg-[rgb(var(--surface))] px-2 py-0.5 text-xs text-muted">
          {summary}
        </span>
      ) : null}
    </span>
  );

  const header = showHeader ? (
    collapsible ? (
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setOpen((prev) => !prev)}
      >
        {titleRow}
        <span
          className={`text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </button>
    ) : (
      <div className="flex items-center gap-2">{titleRow}</div>
    )
  ) : null;

  const body = isOpen ? (
    <div id={contentId} className={gridClass}>
      {children}
    </div>
  ) : null;

  if (step) {
    return (
      <section className="space-y-3 rounded-lg border border-[rgb(var(--border))] border-l-[3px] border-l-[rgb(var(--primary))] bg-[rgb(var(--surface-muted))]/70 p-4">
        {header}
        {body}
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {header}
      {body}
    </section>
  );
}
