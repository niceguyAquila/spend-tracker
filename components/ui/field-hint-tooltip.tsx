"use client";

import { useId, useState, type ReactNode } from "react";

type Props = {
  /** Helper copy shown in the tooltip. */
  content: ReactNode;
  /** Accessible name for the info trigger. Defaults to "More information". */
  label?: string;
  className?: string;
};

/**
 * Compact ⓘ trigger that reveals helper text on hover and keyboard focus.
 * Prefer this over always-visible muted subtitles under form labels.
 */
export function FieldHintTooltip({
  content,
  label = "More information",
  className = ""
}: Props) {
  const tipId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className={`relative inline-flex align-middle ${className}`.trim()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[10px] font-semibold leading-none text-muted transition hover:border-[rgb(var(--primary)/0.55)] hover:text-[rgb(var(--primary))] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(var(--focus),0.25)]"
        aria-label={label}
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          // Avoid activating a wrapping <label> / radio control.
          event.preventDefault();
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
            event.currentTarget.blur();
          }
        }}
      >
        <span aria-hidden>ⓘ</span>
      </button>
      <span
        id={tipId}
        role="tooltip"
        className={`absolute bottom-[calc(100%+0.35rem)] left-1/2 z-50 w-56 -translate-x-1/2 rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-2.5 py-2 text-left text-xs font-normal normal-case leading-snug text-[rgb(var(--text))] shadow-md ${
          open ? "pointer-events-none visible opacity-100" : "pointer-events-none invisible opacity-0"
        }`}
      >
        {content}
      </span>
    </span>
  );
}
