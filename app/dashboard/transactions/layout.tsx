import { TransactionsSubNav } from "@/components/transactions-sub-nav";

export default function TransactionsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <TransactionsSubNav />
      {children}
    </div>
  );
}
