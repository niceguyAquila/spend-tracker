import { LoadingIndicator } from "@/components/ui/loading-indicator";

export default function SettingsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <section className="card">
        <LoadingIndicator label="Loading settings..." />
      </section>
      <section className="card h-64 animate-pulse bg-[rgb(var(--surface-muted))]" />
    </div>
  );
}
