import { LoadingIndicator } from "@/components/ui/loading-indicator";

export default function SpendingLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <section className="card h-16 animate-pulse bg-[rgb(var(--surface-muted))]" />
      <section className="card">
        <LoadingIndicator label="Loading spending data..." />
      </section>
      <section className="card h-96 animate-pulse bg-[rgb(var(--surface-muted))]" />
    </div>
  );
}
