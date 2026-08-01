import { BigBookIndividualTypeLedgerPanel } from "@/components/big-book-individual-type-ledger-panel";
import { PageHeader } from "@/components/ui/page-header";
import { SetupRequiredCard } from "@/components/ui/setup-required-card";
import { getBigBookLedgerTypes } from "@/lib/db/queries";

export default async function IndividualTypeLedgerPage() {
  try {
    // Types only — entries are fetched on demand for the selected type so we
    // never hydrate thousands of joined rows into the client bundle.
    const types = await getBigBookLedgerTypes({ includeInactive: true });

    return (
      <div className="space-y-6">
        <PageHeader
          title="Transaction Type Dashboard"
          description="View records and monthly totals for one selected Big Book type."
        />
        <BigBookIndividualTypeLedgerPanel types={types} />
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
