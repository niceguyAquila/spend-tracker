import { SpendingSubNav } from "@/components/spending-sub-nav";

export default function SpendingLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <SpendingSubNav />
      {children}
    </div>
  );
}
