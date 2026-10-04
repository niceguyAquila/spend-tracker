import {
  getBigBookActionBy,
  getBigBookActors,
  getBigBookActorPockets,
  getBigBookAllowedUsers,
  getBigBookInvoiceWallets,
  getBigBookLedgerTypeInvoiceProfiles,
  getBigBookLedgerTypes,
  getBigBookTypeVendorTypeMaps,
  getBigBookVendorTypes,
  getBigBookVendors
} from "@/lib/db/queries";
import { BigBookSettingsPanel } from "@/components/big-book-settings-panel";
import { PageHeader } from "@/components/ui/page-header";
import { SetupRequiredCard } from "@/components/ui/setup-required-card";

export default async function BigBookSettingsPage() {
  try {
    const [
      types,
      vendorTypes,
      vendors,
      actionBy,
      pockets,
      actors,
      allowedUsers,
      typeVendorTypeMaps,
      wallets,
      typeInvoiceProfiles
    ] = await Promise.all([
      getBigBookLedgerTypes({ includeInactive: true }),
      getBigBookVendorTypes({ includeInactive: true }),
      getBigBookVendors({ includeInactive: true }),
      getBigBookActionBy({ includeInactive: true }),
      getBigBookActorPockets({ includeInactive: true }),
      getBigBookActors(),
      getBigBookAllowedUsers(),
      getBigBookTypeVendorTypeMaps(),
      getBigBookInvoiceWallets({ includeInactive: true }),
      getBigBookLedgerTypeInvoiceProfiles()
    ]);

    return (
      <div className="space-y-6">
        <PageHeader
          title="Big Book Settings"
          description="Manage types, invoice group PIC presets, type→vendor type mappings, vendor types, vendor names, Action By, actor pockets, invoice wallets, and global Actor A/B mapping."
        />
        <BigBookSettingsPanel
          initialTypes={types}
          initialVendorTypes={vendorTypes}
          initialVendors={vendors}
          initialActionBy={actionBy}
          initialPockets={pockets}
          initialActors={actors}
          allowedUsers={allowedUsers}
          initialTypeVendorTypeMaps={typeVendorTypeMaps}
          initialWallets={wallets}
          initialTypeInvoiceProfiles={typeInvoiceProfiles}
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
