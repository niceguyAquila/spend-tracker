import { MasterDashboardBigBookTypeCashflowTable } from "@/components/master-dashboard-tables";
import { BigBookTypeCashflowFilters } from "@/components/big-book-type-cashflow-filters";
import { BigBookVendorActorOutstandingTable } from "@/components/big-book-vendor-actor-outstanding-table";
import { PageHeader } from "@/components/ui/page-header";
import { SetupRequiredCard } from "@/components/ui/setup-required-card";
import {
  getBigBookActors,
  getBigBookLedgerTypes,
  getBigBookTypeCashflowByCurrency,
  getBigBookVendorActorOutstanding,
  getBigBookVendorTypes,
  getBigBookVendors
} from "@/lib/db/queries";

type SearchParamValue = string | string[] | undefined;
type CashflowCurrency = "IDR" | "MYR" | "USDT" | "TRX";

const ALLOWED_CURRENCIES: CashflowCurrency[] = ["IDR", "MYR", "USDT", "TRX"];

type BigBookMasterDashboardPageProps = {
  searchParams?: Promise<Record<string, SearchParamValue>>;
};

function normalizeArrayParam(param: SearchParamValue): string[] {
  if (!param) return [];
  const list = Array.isArray(param) ? param : [param];
  const cleaned = list
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return Array.from(new Set(cleaned));
}

function normalizeDateParam(param: SearchParamValue): string {
  const value = Array.isArray(param) ? param[0] ?? "" : param ?? "";
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
}

export default async function BigBookMasterDashboardPage({ searchParams }: BigBookMasterDashboardPageProps) {
  try {
    const params = (await searchParams) ?? {};
    const actorIds = normalizeArrayParam(params.actorId);
    const typeIds = normalizeArrayParam(params.typeId);
    const vendorTypeIds = normalizeArrayParam(params.vendorTypeId);
    const vendorIds = normalizeArrayParam(params.vendorId);
    const currencyCodes = normalizeArrayParam(params.currencyCode).filter((value): value is CashflowCurrency =>
      (ALLOWED_CURRENCIES as string[]).includes(value)
    );
    const dateFrom = normalizeDateParam(params.dateFrom);
    const dateTo = normalizeDateParam(params.dateTo);

    const [actors, types, vendorTypes, vendors, sourceRowsByCurrency, vendorActorOutstanding] =
      await Promise.all([
        getBigBookActors(),
        getBigBookLedgerTypes({ includeInactive: true }),
        getBigBookVendorTypes({ includeInactive: true }),
        getBigBookVendors({ includeInactive: true }),
        getBigBookTypeCashflowByCurrency({
          actorId: actorIds.length ? actorIds : undefined,
          typeId: typeIds.length ? typeIds : undefined,
          vendorTypeId: vendorTypeIds.length ? vendorTypeIds : undefined,
          vendorId: vendorIds.length ? vendorIds : undefined,
          currencyCode: currencyCodes.length ? currencyCodes : undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined
        }),
        getBigBookVendorActorOutstanding({
          actorId: actorIds.length ? actorIds : undefined,
          vendorTypeId: vendorTypeIds.length ? vendorTypeIds : undefined,
          vendorId: vendorIds.length ? vendorIds : undefined,
          currencyCode: currencyCodes.length ? currencyCodes : undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined
        })
      ]);

    return (
      <div className="space-y-6">
        <PageHeader
          title="Master Dashboard"
          description="Cashflow summary by ledger type across each currency."
        />

        <section className="card">
          <h2 className="text-lg font-semibold">Cashflow by Type and Currency</h2>
          <p className="mt-1 text-sm text-muted">
            Each row is grouped by Actor + Type. Inflow is blue, outflow is red, and net follows its value sign.
            Pocket transactions are excluded here, so with no filters applied the combined net per currency matches
            Grand Total by Actor on the Transaction Dashboard.
          </p>
          <BigBookTypeCashflowFilters
            actors={actors}
            types={types}
            vendorTypes={vendorTypes}
            vendors={vendors}
            initialActorIds={actorIds}
            initialTypeIds={typeIds}
            initialVendorTypeIds={vendorTypeIds}
            initialVendorIds={vendorIds}
            initialCurrencyCodes={currencyCodes}
            initialDateFrom={dateFrom}
            initialDateTo={dateTo}
          />
          <MasterDashboardBigBookTypeCashflowTable sourceRowsByCurrency={sourceRowsByCurrency} />
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Outstanding Credit by Vendor and Actor</h2>
          <p className="mt-1 text-sm text-muted">
            Who owes whom: vendor (owes) to actor (owed), per currency. Fully settled credits are omitted.
            Filters above also apply here; date range selects which credits are included, while all of their
            settlements still count against outstanding.
          </p>
          <BigBookVendorActorOutstandingTable rows={vendorActorOutstanding} />
        </section>
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
