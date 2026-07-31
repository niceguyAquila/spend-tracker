import { LoadingIndicator } from "@/components/ui/loading-indicator";

export default function TransactionsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <section className="card h-16 animate-pulse bg-[rgb(var(--surface-muted))]" />
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="card h-20 animate-pulse bg-[rgb(var(--surface-muted))]" />
        <article className="card h-20 animate-pulse bg-[rgb(var(--surface-muted))]" />
        <article className="card h-20 animate-pulse bg-[rgb(var(--surface-muted))]" />
        <article className="card h-20 animate-pulse bg-[rgb(var(--surface-muted))]" />
        <article className="card h-20 animate-pulse bg-[rgb(var(--surface-muted))]" />
        <article className="card h-20 animate-pulse bg-[rgb(var(--surface-muted))]" />
      </section>
      <section className="card">
        <LoadingIndicator label="Loading transaction data..." />
      </section>
      <section className="card h-96 animate-pulse bg-[rgb(var(--surface-muted))]" />
    </div>
  );
}
