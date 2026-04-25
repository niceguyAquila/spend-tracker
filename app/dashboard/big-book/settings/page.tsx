import { getBigBookActors, getBigBookAllowedUsers, getBigBookLedgerTypes } from "@/lib/db/queries";
import { BigBookSettingsPanel } from "@/components/big-book-settings-panel";
import { BigBookSubNav } from "@/components/big-book-sub-nav";

export default async function BigBookSettingsPage() {
  const [types, actors, allowedUsers] = await Promise.all([
    getBigBookLedgerTypes({ includeInactive: true }),
    getBigBookActors(),
    getBigBookAllowedUsers()
  ]);

  return (
    <div className="space-y-6">
      <section className="card">
        <div>
          <h1 className="text-xl font-semibold">Big Book Settings</h1>
          <p className="text-sm text-slate-600">Manage types and global Actor A/B mapping.</p>
        </div>
      </section>
      <BigBookSubNav />
      <BigBookSettingsPanel initialTypes={types} initialActors={actors} allowedUsers={allowedUsers} />
    </div>
  );
}
