import Link from "next/link";
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
  const navLinks = isAdmin
    ? [...links, { href: "/dashboard/admin/users", label: "Admin Users" }, { href: "/dashboard/admin/brands", label: "Admin Brands" }]
    : links;

  return (
    <nav className="mb-6 flex flex-wrap items-start gap-3 lg:mb-8 lg:items-center">
      <div className="flex flex-1 flex-wrap gap-2">
        {navLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
          >
            {item.label}
          </Link>
        ))}
      </div>
      <div className="w-full lg:ml-auto lg:w-auto">
        <BrandSwitcher activeBrandId={activeBrandId} options={brandOptions} compact />
      </div>
    </nav>
  );
}
