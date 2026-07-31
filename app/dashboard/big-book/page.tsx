import {
  getBigBookActors,
  getBigBookActorCurrencyMetrics,
  getBigBookActorPocketMetrics,
  getBigBookActorPockets,
  getBigBookLedgerRowsPaged,
  getBigBookLedgerSubTypes,
  getBigBookLedgerTypes,
  getBigBookVendorActorOutstanding,
  getBigBookVendorTypes,
  getBigBookVendors
} from "@/lib/db/queries";
import { BigBookPanel } from "@/components/big-book-panel";
import { PageHeader } from "@/components/ui/page-header";
import { SetupRequiredCard } from "@/components/ui/setup-required-card";
import { DEFAULT_PAGE_SIZE } from "@/lib/table-pagination";

export default async function BigBookPage() {
  try {
    const [
      types,
      subTypes,
      vendorTypes,
      vendors,
      pockets,
      actors,
      entriesPage,
      actorMetrics,
      actorPocketMetrics,
      vendorActorOutstanding
    ] = await Promise.all([
      getBigBookLedgerTypes({ includeInactive: true }),
      getBigBookLedgerSubTypes({ includeInactive: true }),
      getBigBookVendorTypes({ includeInactive: true }),
      getBigBookVendors({ includeInactive: true }),
      getBigBookActorPockets({ includeInactive: true }),
      getBigBookActors(),
      getBigBookLedgerRowsPaged({ page: 0, pageSize: DEFAULT_PAGE_SIZE }),
      getBigBookActorCurrencyMetrics(),
      getBigBookActorPocketMetrics(),
      getBigBookVendorActorOutstanding()
    ]);

    return (
      <div className="space-y-6">
        <PageHeader
          title="Transaction Dashboard"
          description="Manage operational spendings and business profits."
        />
        <BigBookPanel
          initialTypes={types}
          initialSubTypes={subTypes}
          initialVendorTypes={vendorTypes}
          initialVendors={vendors}
          initialPockets={pockets}
          initialActors={actors}
          initialLedgerRows={entriesPage.rows}
          initialTotalCount={entriesPage.totalCount}
          initialTotals={entriesPage.totals}
          initialActorMetrics={actorMetrics}
          initialActorPocketMetrics={actorPocketMetrics}
          initialVendorActorOutstanding={vendorActorOutstanding}
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
        title="Big Book setup required"
        message="The app cannot read Big Book tables yet. Apply SQL migrations in `supabase/migrations` and refresh."
        error={errorText}
      />
    );
  }
}
