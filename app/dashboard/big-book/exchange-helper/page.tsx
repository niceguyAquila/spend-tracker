import { redirect } from "next/navigation";
import { BigBookSubNav } from "@/components/big-book-sub-nav";
import { BigBookExchangeHelperPanel } from "@/components/big-book-exchange-helper-panel";
import { requireAllowedUser } from "@/lib/auth";

export default async function BigBookExchangeHelperPage() {
  const { globalRole } = await requireAllowedUser();
  if (globalRole !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <div>
          <h1 className="text-xl font-semibold">Big Book Exchange Helper</h1>
          <p className="text-sm text-slate-600">
            Check today&apos;s conversion estimate for supported Big Book currencies.
          </p>
        </div>
      </section>
      <BigBookSubNav />
      <BigBookExchangeHelperPanel />
    </div>
  );
}
