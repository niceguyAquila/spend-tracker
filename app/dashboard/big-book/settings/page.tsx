import {
  getBigBookActors,
  getBigBookActorPockets,
  getBigBookAllowedUsers,
  getBigBookLedgerSubTypes,
  getBigBookLedgerTypes,
  getBigBookVendorTypes,
  getBigBookVendors
} from "@/lib/db/queries";
import { BigBookSettingsPanel } from "@/components/big-book-settings-panel";
import { PageHeader } from "@/components/ui/page-header";
import { SetupRequiredCard } from "@/components/ui/setup-required-card";

export default async function BigBookSettingsPage() {
  try {
    const [types, subTypes, vendorTypes, vendors, pockets, actors, allowedUsers] = await Promise.all([
      getBigBookLedgerTypes({ includeInactive: true }),
      getBigBookLedgerSubTypes({ includeInactive: true }),
      getBigBookVendorTypes({ includeInactive: true }),
      getBigBookVendors({ includeInactive: true }),
      getBigBookActorPockets({ includeInactive: true }),
      getBigBookActors(),
      getBigBookAllowedUsers()
    ]);

    return (
      <div className="space-y-6">
        <PageHeader
          title="Big Book Settings"
          description="Manage types, sub-types, vendor types, vendor names, actor pockets, and global Actor A/B mapping."
        />
        <BigBookSettingsPanel
          initialTypes={types}
          initialSubTypes={subTypes}
          initialVendorTypes={vendorTypes}
          initialVendors={vendors}
          initialPockets={pockets}
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
        title="Big Book setup required"
        message="The app cannot read Big Book tables yet. Apply SQL migrations in `supabase/migrations` and refresh."
        error={errorText}
      />
    );
  }
}
