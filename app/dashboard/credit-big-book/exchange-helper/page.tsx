import { CreditBigBookExchangeHelperPanel } from "@/components/credit-big-book-exchange-helper-panel";
import { PageHeader } from "@/components/ui/page-header";

export default async function CreditBigBookExchangeHelperPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Credit Big Book Exchange Helper"
        description="Check today's conversion estimate for supported Credit Big Book currencies."
      />
      <CreditBigBookExchangeHelperPanel />
    </div>
  );
}
