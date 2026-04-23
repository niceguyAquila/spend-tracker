"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function getButtonClassName(isActive: boolean) {
  return `btn-secondary ${
    isActive
      ? "!border-blue-600 !bg-blue-600 !text-white hover:!bg-blue-600"
      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
  }`;
}

export function BigBookSubNav() {
  const pathname = usePathname();
  const isDashboardPage = pathname === "/dashboard/big-book";
  const isIndividualTypePage = pathname === "/dashboard/big-book/individual-type-ledger";
  const isSettingsPage = pathname === "/dashboard/big-book/settings";

  return (
    <section className="card">
      <h2 className="text-lg font-semibold">Big Book Pages</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/dashboard/big-book" className={getButtonClassName(isDashboardPage)}>
          Dashboard
        </Link>
        <Link
          href="/dashboard/big-book/individual-type-ledger"
          className={getButtonClassName(isIndividualTypePage)}
        >
          Individual Type Ledger
        </Link>
        <Link href="/dashboard/big-book/settings" className={getButtonClassName(isSettingsPage)}>
          Settings
        </Link>
      </div>
    </section>
  );
}
