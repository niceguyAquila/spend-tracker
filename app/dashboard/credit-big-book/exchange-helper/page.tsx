import { CreditBigBookExchangeHelperPanel } from "@/components/credit-big-book-exchange-helper-panel";

export default async function CreditBigBookExchangeHelperPage() {
  return (
    <div className="space-y-6">
      <section className="card">
        <div>
          <h1 className="text-xl font-semibold">Credit Big Book Exchange Helper</h1>
          <p className="text-sm text-slate-600">
            Check today&apos;s conversion estimate for supported Credit Big Book currencies.
          </p>
        </div>
      </section>
      <CreditBigBookExchangeHelperPanel />
    </div>
  );
}
