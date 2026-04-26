"use client";

type LoadingIndicatorProps = {
  label?: string;
  className?: string;
};

export function LoadingIndicator({ label = "Loading...", className }: LoadingIndicatorProps) {
  return (
    <span className={`inline-flex items-center gap-2 text-sm text-[rgb(var(--text-muted))] ${className ?? ""}`}>
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-[rgb(var(--border))] border-t-[rgb(var(--text))]"
        aria-hidden
      />
      <span>{label}</span>
    </span>
  );
}
