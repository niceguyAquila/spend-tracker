"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

function getButtonClassName(isActive: boolean) {
  return `btn-secondary ${
    isActive
      ? "!border-blue-600 !bg-blue-600 !text-white hover:!bg-blue-600"
      : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-muted))]"
  }`;
}

export function TransactionsSubNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const source = searchParams.get("source");

  const isComparisonPage = pathname === "/dashboard/transactions/comparison";
  const isBackofficePage = pathname === "/dashboard/transactions" && source === "backoffice";
  const isPaymentGatewayPage =
    pathname === "/dashboard/transactions" && (source === "payment_gateway" || source === null);

  return (
    <section className="card">
      <h2 className="text-lg font-semibold">Web Transaction Pages</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/dashboard/transactions?source=backoffice" className={getButtonClassName(isBackofficePage)}>
          Backoffice
        </Link>
        <Link href="/dashboard/transactions?source=payment_gateway" className={getButtonClassName(isPaymentGatewayPage)}>
          Payment Gateway
        </Link>
        <Link href="/dashboard/transactions/comparison" className={getButtonClassName(isComparisonPage)}>
          Comparison
        </Link>
      </div>
    </section>
  );
}
