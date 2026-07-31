import { BigBookExchangeHelperPanel } from "@/components/big-book-exchange-helper-panel";
import { PageHeader } from "@/components/ui/page-header";

export default async function BigBookExchangeHelperPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Big Book Exchange Helper"
        description="Check today's conversion estimate for supported Big Book currencies."
      />
      <BigBookExchangeHelperPanel />
    </div>
  );
}
