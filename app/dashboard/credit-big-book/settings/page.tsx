import {
  getCreditBookActors,
  getCreditBookAllowedUsers,
  getCreditBookLedgerSubTypes,
  getCreditBookLedgerTypes
} from "@/lib/db/queries";
import { CreditBigBookSettingsPanel } from "@/components/credit-big-book-settings-panel";

export default async function CreditBigBookSettingsPage() {
  const [types, subTypes, actors, allowedUsers] = await Promise.all([
    getCreditBookLedgerTypes({ includeInactive: true }),
    getCreditBookLedgerSubTypes({ includeInactive: true }),
    getCreditBookActors(),
    getCreditBookAllowedUsers()
  ]);

  return (
    <div className="space-y-6">
      <section className="card">
        <div>
          <h1 className="text-xl font-semibold">Credit Big Book Settings</h1>
          <p className="text-sm text-slate-600">Manage types, sub-types, and global Actor A/B mapping.</p>
        </div>
      </section>
      <CreditBigBookSettingsPanel
        initialTypes={types}
        initialSubTypes={subTypes}
        initialActors={actors}
        allowedUsers={allowedUsers}
      />
    </div>
  );
}
