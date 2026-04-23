import { redirect } from "next/navigation";
import { requireAllowedUser } from "@/lib/auth";
import {
  getBigBookActors,
  getBigBookActorCurrencyMetrics,
  getBigBookEntries,
  getBigBookLedgerTypes
} from "@/lib/db/queries";
import { BigBookPanel } from "@/components/big-book-panel";
import { BigBookSubNav } from "@/components/big-book-sub-nav";

export default async function BigBookPage() {
  try {
    const { globalRole, activeBrandId } = await requireAllowedUser();
    if (globalRole !== "admin") {
      redirect("/dashboard");
    }

    const [types, actors, entries, actorMetrics] = await Promise.all([
      getBigBookLedgerTypes({ includeInactive: true }),
      getBigBookActors(),
      getBigBookEntries(activeBrandId, { limit: 1000 }),
      getBigBookActorCurrencyMetrics(activeBrandId)
    ]);

    return (
      <div className="space-y-6">
        <section className="card">
          <div>
            <h1 className="text-xl font-semibold">Big Book of Accounting</h1>
            <p className="text-sm text-slate-600">
              Manage operational spendings and business profits.
            </p>
          </div>
        </section>
        <BigBookSubNav />
        <BigBookPanel
          initialTypes={types}
          initialActors={actors}
          initialEntries={entries}
          initialActorMetrics={actorMetrics}
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
      <section className="card">
        <h2 className="mb-2 text-lg font-semibold">Big Book setup required</h2>
        <p className="text-sm text-slate-700">
          The app cannot read Big Book tables yet. Apply SQL migrations in `supabase/migrations` and refresh.
        </p>
        <p className="mt-2 text-xs text-slate-500">Error: {errorText}</p>
      </section>
    );
  }
}
