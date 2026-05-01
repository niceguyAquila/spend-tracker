import { MasterDashboardCreditBookTypeCashflowTable } from "@/components/master-dashboard-tables";
import { CreditBigBookTypeCashflowFilters } from "@/components/credit-big-book-type-cashflow-filters";
import {
  getCreditBookActors,
  getCreditBookLedgerTypes,
  getCreditBookTypeCashflowByCurrency
} from "@/lib/db/queries";

type SearchParamValue = string | string[] | undefined;
type CashflowCurrency = "IDR" | "MYR" | "USDT" | "TRX";

const ALLOWED_CURRENCIES: CashflowCurrency[] = ["IDR", "MYR", "USDT", "TRX"];

type CreditBigBookMasterDashboardPageProps = {
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

export default async function CreditBigBookMasterDashboardPage({ searchParams }: CreditBigBookMasterDashboardPageProps) {
  try {
    const params = (await searchParams) ?? {};
    const actorIds = normalizeArrayParam(params.actorId);
    const typeIds = normalizeArrayParam(params.typeId);
    const currencyCodes = normalizeArrayParam(params.currencyCode).filter((value): value is CashflowCurrency =>
      (ALLOWED_CURRENCIES as string[]).includes(value)
    );
    const dateFrom = normalizeDateParam(params.dateFrom);
    const dateTo = normalizeDateParam(params.dateTo);

    const [actors, types, sourceRowsByCurrency] = await Promise.all([
      getCreditBookActors(),
      getCreditBookLedgerTypes({ includeInactive: true }),
      getCreditBookTypeCashflowByCurrency({
        actorId: actorIds.length ? actorIds : undefined,
        typeId: typeIds.length ? typeIds : undefined,
        currencyCode: currencyCodes.length ? currencyCodes : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined
      })
    ]);

    return (
      <div className="space-y-6">
        <section className="card">
          <div>
            <h1 className="text-xl font-semibold">Master Dashboard</h1>
            <p className="text-sm text-slate-600">
              Cashflow summary by ledger type across each currency.
            </p>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-semibold">Cashflow by Type and Currency</h2>
          <p className="mt-1 text-sm text-slate-600">
            Each row is grouped by Actor + Type. Inflow (credit) is blue, outflow (debt) is red, and net follows its value sign.
          </p>
          <CreditBigBookTypeCashflowFilters
            actors={actors}
            types={types}
            initialActorIds={actorIds}
            initialTypeIds={typeIds}
            initialCurrencyCodes={currencyCodes}
            initialDateFrom={dateFrom}
            initialDateTo={dateTo}
          />
          <MasterDashboardCreditBookTypeCashflowTable sourceRowsByCurrency={sourceRowsByCurrency} />
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
