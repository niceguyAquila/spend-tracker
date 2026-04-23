import { LoadingIndicator } from "@/components/ui/loading-indicator";

export default function BigBookLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <section className="card">
        <LoadingIndicator label="Loading Big Book data..." />
      </section>
      <section className="card h-40 animate-pulse bg-slate-100" />
      <section className="card h-72 animate-pulse bg-slate-100" />
      <section className="card h-80 animate-pulse bg-slate-100" />
    </div>
  );
}
