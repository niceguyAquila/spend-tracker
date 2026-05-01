"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function getButtonClassName(isActive: boolean) {
  return `btn-secondary ${
    isActive
      ? "!border-blue-600 !bg-blue-600 !text-white hover:!bg-blue-600"
      : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-muted))]"
  }`;
}

export function CreditBigBookSubNav() {
  const pathname = usePathname();
  const isDashboardPage = pathname === "/dashboard/credit-big-book";
  const isMasterDashboardPage = pathname === "/dashboard/credit-big-book/master-dashboard";
  const isIndividualTypePage = pathname === "/dashboard/credit-big-book/individual-type-ledger";
  const isSettingsPage = pathname === "/dashboard/credit-big-book/settings";
  const isExchangeHelperPage = pathname === "/dashboard/credit-big-book/exchange-helper";

  return (
    <section className="card">
      <h2 className="text-lg font-semibold">Credit Big Book Pages</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/dashboard/credit-big-book/master-dashboard"
          className={getButtonClassName(isMasterDashboardPage)}
        >
          Master Dashboard
        </Link>
        <Link href="/dashboard/credit-big-book" className={getButtonClassName(isDashboardPage)}>
          Credit Dashboard
        </Link>
        <Link
          href="/dashboard/credit-big-book/individual-type-ledger"
          className={getButtonClassName(isIndividualTypePage)}
        >
          Credit Type Dashboard
        </Link>
        <Link href="/dashboard/credit-big-book/settings" className={getButtonClassName(isSettingsPage)}>
          Settings
        </Link>
        <Link
          href="/dashboard/credit-big-book/exchange-helper"
          className={getButtonClassName(isExchangeHelperPage)}
        >
          Exchange Helper
        </Link>
      </div>
    </section>
  );
}
