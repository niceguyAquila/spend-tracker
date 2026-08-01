import {
  getBigBookActionBy,
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
import { perfTimed } from "@/lib/perf";
import type { BigBookMetricsBundle } from "@/components/big-book-metrics-cards";

export default async function BigBookPage() {
  try {
    const pageEnd =
      process.env.PERF_DEBUG === "1"
        ? (() => {
            const start = performance.now();
            return () =>
              console.log(`[perf] big-book/page core: ${(performance.now() - start).toFixed(1)}ms`);
          })()
        : () => undefined;

    // Metrics stream separately via Suspense so the ledger table is not blocked.
    const metricsPromise: Promise<BigBookMetricsBundle> = Promise.all([
      perfTimed("getBigBookActorCurrencyMetrics", () => getBigBookActorCurrencyMetrics()),
      perfTimed("getBigBookActorPocketMetrics", () => getBigBookActorPocketMetrics()),
      perfTimed("getBigBookVendorActorOutstanding", () => getBigBookVendorActorOutstanding())
    ]).then(([actorMetrics, actorPocketMetrics, vendorActorOutstanding]) => ({
      actorMetrics,
      actorPocketMetrics,
      vendorActorOutstanding
    }));

    const [types, subTypes, vendorTypes, vendors, actionBy, pockets, actors, entriesPage] =
      await Promise.all([
        perfTimed("getBigBookLedgerTypes", () => getBigBookLedgerTypes({ includeInactive: true })),
        perfTimed("getBigBookLedgerSubTypes", () => getBigBookLedgerSubTypes({ includeInactive: true })),
        perfTimed("getBigBookVendorTypes", () => getBigBookVendorTypes({ includeInactive: true })),
        perfTimed("getBigBookVendors", () => getBigBookVendors({ includeInactive: true })),
        perfTimed("getBigBookActionBy", () => getBigBookActionBy({ includeInactive: true })),
        perfTimed("getBigBookActorPockets", () => getBigBookActorPockets({ includeInactive: true })),
        perfTimed("getBigBookActors", () => getBigBookActors()),
        perfTimed("getBigBookLedgerRowsPaged", () =>
          getBigBookLedgerRowsPaged({
            page: 0,
            pageSize: DEFAULT_PAGE_SIZE,
            sortBy: "entry_date",
            sortDir: "desc"
          })
        )
      ]);
    pageEnd();

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
          initialActionBy={actionBy}
          initialPockets={pockets}
          initialActors={actors}
          initialLedgerRows={entriesPage.rows}
          initialTotalCount={entriesPage.totalCount}
          initialTotals={entriesPage.totals}
          metricsPromise={metricsPromise}
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
