import {
  getCreditBookActors,
  getCreditBookAllowedUsers,
  getCreditBookLedgerSubTypes,
  getCreditBookLedgerTypes
} from "@/lib/db/queries";
import { CreditBigBookSettingsPanel } from "@/components/credit-big-book-settings-panel";
import { PageHeader } from "@/components/ui/page-header";
import { SetupRequiredCard } from "@/components/ui/setup-required-card";

export default async function CreditBigBookSettingsPage() {
  try {
    const [types, subTypes, actors, allowedUsers] = await Promise.all([
      getCreditBookLedgerTypes({ includeInactive: true }),
      getCreditBookLedgerSubTypes({ includeInactive: true }),
      getCreditBookActors(),
      getCreditBookAllowedUsers()
    ]);

    return (
      <div className="space-y-6">
        <PageHeader
          title="Credit Big Book Settings"
          description="Manage types, sub-types, and global Actor A/B mapping."
        />
        <CreditBigBookSettingsPanel
          initialTypes={types}
          initialSubTypes={subTypes}
          initialActors={actors}
          allowedUsers={allowedUsers}
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
