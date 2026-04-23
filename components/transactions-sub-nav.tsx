"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

function getButtonClassName(isActive: boolean) {
  return `btn-secondary ${
    isActive
      ? "!border-blue-600 !bg-blue-600 !text-white hover:!bg-blue-600"
      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
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
