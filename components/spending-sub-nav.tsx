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

type Props = {
  canManageCategories: boolean;
};

export function SpendingSubNav({ canManageCategories }: Props) {
  const pathname = usePathname();
  const isOverviewPage = pathname === "/dashboard/spending/overview";
  const isEntriesPage = pathname === "/dashboard/spending/entries";

  return (
    <section className="card">
      <h2 className="text-lg font-semibold">Web Spending Pages</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/dashboard/spending/overview" className={getButtonClassName(isOverviewPage)}>
          Overview
        </Link>
        <Link href="/dashboard/spending/entries" className={getButtonClassName(isEntriesPage)}>
          Add Spending
        </Link>
        {canManageCategories ? (
          <Link href="/dashboard/settings/categories" className="btn-secondary">
            Add Category
          </Link>
        ) : null}
      </div>
    </section>
  );
}
