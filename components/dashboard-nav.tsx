"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandSwitcher } from "@/components/brand-switcher";

const links = [
  { href: "/dashboard/spending", label: "Web Spending" },
  { href: "/dashboard/transactions", label: "Web Transaction" },
  { href: "/dashboard/settings/categories", label: "Categories" }
];

type Props = {
  isAdmin: boolean;
  activeBrandId: string;
  brandOptions: Array<{ id: string; name: string }>;
};

export function DashboardNav({ isAdmin, activeBrandId, brandOptions }: Props) {
  const pathname = usePathname();
  const isBigBookRoute = pathname.startsWith("/dashboard/big-book");
  const navLinks = isAdmin
    ? [
        ...links,
        { href: "/dashboard/big-book", label: "Big Book" },
        { href: "/dashboard/admin/users", label: "Admin Users" },
        { href: "/dashboard/admin/brands", label: "Admin Brands" }
      ]
    : links;

  function isActiveLink(href: string) {
    if (href === "/dashboard/spending") return pathname.startsWith("/dashboard/spending");
    if (href === "/dashboard/transactions") return pathname.startsWith("/dashboard/transactions");
    if (href === "/dashboard/settings/categories") return pathname.startsWith("/dashboard/settings/categories");
    if (href === "/dashboard/big-book") return pathname.startsWith("/dashboard/big-book");
    if (href === "/dashboard/admin/users") return pathname.startsWith("/dashboard/admin/users");
    if (href === "/dashboard/admin/brands") return pathname.startsWith("/dashboard/admin/brands");
    return pathname === href;
  }

  function getNavButtonClassName(isActive: boolean) {
    return `rounded-md border px-3 py-2 text-sm font-medium ${
      isActive
        ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-600"
        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
    }`;
  }

  return (
    <nav className="mb-6 flex flex-wrap items-start gap-3 lg:mb-8 lg:items-center">
      <div className="flex flex-1 flex-wrap gap-2">
        {navLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={getNavButtonClassName(isActiveLink(item.href))}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <div className="w-full lg:ml-auto lg:w-auto">
        <BrandSwitcher activeBrandId={activeBrandId} options={brandOptions} compact disabled={isBigBookRoute} />
      </div>
    </nav>
  );
}
