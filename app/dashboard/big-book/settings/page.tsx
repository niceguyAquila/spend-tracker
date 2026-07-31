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

export default async function BigBookSettingsPage() {
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
      <section className="card">
        <div>
          <h1 className="text-xl font-semibold">Big Book Settings</h1>
          <p className="text-sm text-slate-600">
            Manage types, sub-types, vendor types, vendor names, actor pockets, and global Actor A/B mapping.
          </p>
        </div>
      </section>
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
}
