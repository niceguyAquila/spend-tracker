import {
  getCreditBookActors,
  getCreditBookActorCurrencyMetrics,
  getCreditBookEntriesPaged,
  getCreditBookLedgerSubTypes,
  getCreditBookLedgerTypes
} from "@/lib/db/queries";
import { CreditBigBookPanel } from "@/components/credit-big-book-panel";
import { DEFAULT_PAGE_SIZE } from "@/lib/table-pagination";

export default async function CreditBigBookPage() {
  try {
    const [types, subTypes, actors, entriesPage, actorMetrics] = await Promise.all([
      getCreditBookLedgerTypes({ includeInactive: true }),
      getCreditBookLedgerSubTypes({ includeInactive: true }),
      getCreditBookActors(),
      getCreditBookEntriesPaged({ page: 0, pageSize: DEFAULT_PAGE_SIZE }),
      getCreditBookActorCurrencyMetrics()
    ]);

    return (
      <div className="space-y-6">
        <section className="card">
          <div>
            <h1 className="text-xl font-semibold">Credit Dashboard</h1>
            <p className="text-sm text-slate-600">
              Manage credit (inflow) and debt (outflow) records.
            </p>
          </div>
        </section>
        <CreditBigBookPanel
          initialTypes={types}
          initialSubTypes={subTypes}
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
        <h2 className="mb-2 text-lg font-semibold">Credit Big Book setup required</h2>
        <p className="text-sm text-slate-700">
          The app cannot read Credit Big Book tables yet. Apply SQL migrations in `supabase/migrations` and refresh.
        </p>
        <p className="mt-2 text-xs text-slate-500">Error: {errorText}</p>
      </section>
    );
  }
}
