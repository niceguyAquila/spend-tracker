import {
  getCreditBookActors,
  getCreditBookActorCurrencyMetrics,
  getCreditBookActorOutstandingMetrics,
  getCreditBookEntriesPaged,
  getCreditBookLedgerSubTypes,
  getCreditBookLedgerTypes
} from "@/lib/db/queries";
import { CreditBigBookPanel } from "@/components/credit-big-book-panel";
import { PageHeader } from "@/components/ui/page-header";
import { SetupRequiredCard } from "@/components/ui/setup-required-card";
import { DEFAULT_PAGE_SIZE } from "@/lib/table-pagination";

export default async function CreditBigBookPage() {
  try {
    const [types, subTypes, actors, entriesPage, actorMetrics, outstandingMetrics] = await Promise.all([
      getCreditBookLedgerTypes({ includeInactive: true }),
      getCreditBookLedgerSubTypes({ includeInactive: true }),
      getCreditBookActors(),
      getCreditBookEntriesPaged({ page: 0, pageSize: DEFAULT_PAGE_SIZE }),
      getCreditBookActorCurrencyMetrics(),
      getCreditBookActorOutstandingMetrics()
    ]);

    return (
      <div className="space-y-6">
        <PageHeader
          title="Credit Dashboard"
          description="Manage credit (inflow) and debt (outflow) records."
        />
        <CreditBigBookPanel
          initialTypes={types}
          initialSubTypes={subTypes}
          initialActors={actors}
          initialEntries={entriesPage.rows}
          initialTotalCount={entriesPage.totalCount}
          initialActorMetrics={actorMetrics}
          initialOutstandingMetrics={outstandingMetrics}
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
      <SetupRequiredCard
        title="Credit Big Book setup required"
        message="The app cannot read Credit Big Book tables yet. Apply SQL migrations in `supabase/migrations` and refresh."
        error={errorText}
      />
    );
  }
}
