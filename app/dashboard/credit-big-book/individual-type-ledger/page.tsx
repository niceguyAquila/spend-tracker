import { CreditBigBookIndividualTypeLedgerPanel } from "@/components/credit-big-book-individual-type-ledger-panel";
import { PageHeader } from "@/components/ui/page-header";
import { SetupRequiredCard } from "@/components/ui/setup-required-card";
import { getCreditBookEntries, getCreditBookLedgerTypes } from "@/lib/db/queries";

export default async function CreditIndividualTypeLedgerPage() {
  try {
    const [types, entries] = await Promise.all([
      getCreditBookLedgerTypes({ includeInactive: true }),
      getCreditBookEntries({ limit: 3000 })
    ]);

    return (
      <div className="space-y-6">
        <PageHeader
          title="Credit Type Dashboard"
          description="View records and monthly totals for one selected Credit Big Book type."
        />
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
      <SetupRequiredCard
        title="Credit Big Book setup required"
        message="The app cannot read Credit Big Book tables yet. Apply SQL migrations in `supabase/migrations` and refresh."
        error={errorText}
      />
    );
  }
}
