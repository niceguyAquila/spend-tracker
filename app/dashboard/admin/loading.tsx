import { LoadingIndicator } from "@/components/ui/loading-indicator";

export default function AdminLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <section className="card">
        <LoadingIndicator label="Loading admin data..." />
      </section>
      <section className="card h-24 animate-pulse bg-[rgb(var(--surface-muted))]" />
      <section className="card h-96 animate-pulse bg-[rgb(var(--surface-muted))]" />
    </div>
  );
}
