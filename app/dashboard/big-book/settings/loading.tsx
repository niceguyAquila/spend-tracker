import { LoadingIndicator } from "@/components/ui/loading-indicator";

export default function BigBookSettingsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <section className="card">
        <LoadingIndicator label="Loading Big Book settings..." />
      </section>
      <section className="card h-56 animate-pulse bg-slate-100" />
      <section className="card h-56 animate-pulse bg-slate-100" />
    </div>
  );
}
