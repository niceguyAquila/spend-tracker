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

export function BigBookSubNav() {
  const pathname = usePathname();
  const isDashboardPage = pathname === "/dashboard/big-book";
  const isMasterDashboardPage = pathname === "/dashboard/big-book/master-dashboard";
  const isIndividualTypePage = pathname === "/dashboard/big-book/individual-type-ledger";
  const isSettingsPage = pathname === "/dashboard/big-book/settings";
  const isExchangeHelperPage = pathname === "/dashboard/big-book/exchange-helper";

  return (
    <section className="card">
      <h2 className="text-lg font-semibold">Transaction Big Book Pages</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/dashboard/big-book/master-dashboard" className={getButtonClassName(isMasterDashboardPage)}>
          Master Dashboard
        </Link>
        <Link href="/dashboard/big-book" className={getButtonClassName(isDashboardPage)}>
          Transaction Dashboard
        </Link>
        <Link
          href="/dashboard/big-book/individual-type-ledger"
          className={getButtonClassName(isIndividualTypePage)}
        >
          Transaction Type Dashboard
        </Link>
        <Link href="/dashboard/big-book/settings" className={getButtonClassName(isSettingsPage)}>
          Settings
        </Link>
        <Link href="/dashboard/big-book/exchange-helper" className={getButtonClassName(isExchangeHelperPage)}>
          Exchange Helper
        </Link>
      </div>
    </section>
  );
}
