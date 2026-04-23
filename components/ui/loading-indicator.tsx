"use client";

type LoadingIndicatorProps = {
  label?: string;
  className?: string;
};

export function LoadingIndicator({ label = "Loading...", className }: LoadingIndicatorProps) {
  return (
    <span className={`inline-flex items-center gap-2 text-sm text-slate-600 ${className ?? ""}`}>
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" aria-hidden />
      <span>{label}</span>
    </span>
  );
}
