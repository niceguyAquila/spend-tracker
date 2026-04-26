import {
  getBigBookActors,
  getBigBookActorCurrencyMetrics,
  getBigBookEntriesPaged,
  getBigBookLedgerTypes
} from "@/lib/db/queries";
import { BigBookPanel } from "@/components/big-book-panel";
import { DEFAULT_PAGE_SIZE } from "@/lib/table-pagination";

export default async function BigBookPage() {
  try {
    const [types, actors, entriesPage, actorMetrics] = await Promise.all([
      getBigBookLedgerTypes({ includeInactive: true }),
      getBigBookActors(),
      getBigBookEntriesPaged({ page: 0, pageSize: DEFAULT_PAGE_SIZE }),
      getBigBookActorCurrencyMetrics()
    ]);

    return (
      <div className="space-y-6">
        <section className="card">
          <div>
            <h1 className="text-xl font-semibold">Big Book Ledger Management</h1>
            <p className="text-sm text-slate-600">
              Manage operational spendings and business profits.
            </p>
          </div>
        </section>
        <BigBookPanel
          initialTypes={types}
          initialActors={actors}
          initialEntries={entriesPage.rows}
          initialTotalCount={entriesPage.totalCount}
          initialActorMetrics={actorMetrics}
        />
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
