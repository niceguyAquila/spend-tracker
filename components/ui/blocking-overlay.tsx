"use client";

import { LoadingIndicator } from "@/components/ui/loading-indicator";

type BlockingOverlayProps = {
  active: boolean;
  label?: string;
};

export function BlockingOverlay({ active, label = "Processing request..." }: BlockingOverlayProps) {
  if (!active) return null;
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-[rgb(var(--bg))/80] backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] px-4 py-3 shadow-sm">
        <LoadingIndicator label={label} />
      </div>
    </div>
  );
}
