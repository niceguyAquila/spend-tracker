import { LoadingIndicator } from "@/components/ui/loading-indicator";

export default function TransactionsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <section className="card">
        <LoadingIndicator label="Loading transaction data..." />
      </section>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <article className="card h-20 animate-pulse bg-[rgb(var(--surface-muted))]" />
        <article className="card h-20 animate-pulse bg-[rgb(var(--surface-muted))]" />
        <article className="card h-20 animate-pulse bg-[rgb(var(--surface-muted))]" />
      </section>
      <section className="card h-96 animate-pulse bg-[rgb(var(--surface-muted))]" />
    </div>
  );
}
