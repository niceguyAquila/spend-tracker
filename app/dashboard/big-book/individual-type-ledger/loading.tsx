import { LoadingIndicator } from "@/components/ui/loading-indicator";

export default function IndividualTypeLedgerLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <section className="card">
        <LoadingIndicator label="Loading Individual Type Ledger..." />
      </section>
      <section className="card h-64 animate-pulse bg-slate-100" />
      <section className="card h-80 animate-pulse bg-slate-100" />
    </div>
  );
}
