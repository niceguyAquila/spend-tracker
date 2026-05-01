import { BigBookIndividualTypeLedgerPanel } from "@/components/big-book-individual-type-ledger-panel";
import { getBigBookEntries, getBigBookLedgerTypes } from "@/lib/db/queries";

export default async function IndividualTypeLedgerPage() {
  try {
    const [types, entries] = await Promise.all([
      getBigBookLedgerTypes({ includeInactive: true }),
      getBigBookEntries({ limit: 3000 })
    ]);

    return (
      <div className="space-y-6">
        <section className="card">
          <div>
            <h1 className="text-xl font-semibold">Transaction Type Dashboard</h1>
            <p className="text-sm text-slate-600">
              View records and monthly totals for one selected Big Book type.
            </p>
          </div>
        </section>
        <BigBookIndividualTypeLedgerPanel types={types} entries={entries} />
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
        <h2 className="mb-2 text-lg font-semibold">Big Book setup required</h2>
        <p className="text-sm text-slate-700">
          The app cannot read Big Book tables yet. Apply SQL migrations in `supabase/migrations` and refresh.
        </p>
        <p className="mt-2 text-xs text-slate-500">Error: {errorText}</p>
      </section>
    );
  }
}
