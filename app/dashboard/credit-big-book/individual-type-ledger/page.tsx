import { CreditBigBookIndividualTypeLedgerPanel } from "@/components/credit-big-book-individual-type-ledger-panel";
import { getCreditBookEntries, getCreditBookLedgerTypes } from "@/lib/db/queries";

export default async function CreditIndividualTypeLedgerPage() {
  try {
    const [types, entries] = await Promise.all([
      getCreditBookLedgerTypes({ includeInactive: true }),
      getCreditBookEntries({ limit: 3000 })
    ]);

    return (
      <div className="space-y-6">
        <section className="card">
          <div>
            <h1 className="text-xl font-semibold">Credit Type Dashboard</h1>
            <p className="text-sm text-slate-600">
              View records and monthly totals for one selected Credit Big Book type.
            </p>
          </div>
        </section>
        <CreditBigBookIndividualTypeLedgerPanel types={types} entries={entries} />
      </div>
    );
  } catch (error) {
    let errorText = "Unknown database error";
    if (error instanceof Error) {
      errorText = error.message;
    } else {
      try {
        errorText = JSON.stringify(error);
      } catch {
        errorText = "Unknown database error";
      }
    }

    return (
      <section className="card">
        <h2 className="mb-2 text-lg font-semibold">Credit Big Book setup required</h2>
        <p className="text-sm text-slate-700">
          The app cannot read Credit Big Book tables yet. Apply SQL migrations in `supabase/migrations` and refresh.
        </p>
        <p className="mt-2 text-xs text-slate-500">Error: {errorText}</p>
      </section>
    );
  }
}
