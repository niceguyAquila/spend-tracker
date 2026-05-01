import {
  getBigBookActors,
  getBigBookAllowedUsers,
  getBigBookLedgerSubTypes,
  getBigBookLedgerTypes
} from "@/lib/db/queries";
import { BigBookSettingsPanel } from "@/components/big-book-settings-panel";

export default async function BigBookSettingsPage() {
  const [types, subTypes, actors, allowedUsers] = await Promise.all([
    getBigBookLedgerTypes({ includeInactive: true }),
    getBigBookLedgerSubTypes({ includeInactive: true }),
    getBigBookActors(),
    getBigBookAllowedUsers()
  ]);

  return (
    <div className="space-y-6">
      <section className="card">
        <div>
          <h1 className="text-xl font-semibold">Big Book Settings</h1>
          <p className="text-sm text-slate-600">Manage types, sub-types, and global Actor A/B mapping.</p>
        </div>
      </section>
      <BigBookSettingsPanel
        initialTypes={types}
        initialSubTypes={subTypes}
        initialActors={actors}
        allowedUsers={allowedUsers}
      />
    </div>
  );
}
