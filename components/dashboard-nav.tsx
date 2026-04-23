import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Web Spending" },
  { href: "/dashboard/transactions", label: "Web Transaction" },
  { href: "/dashboard/settings/categories", label: "Categories" }
];

export function DashboardNav({ isAdmin }: { isAdmin: boolean }) {
  const navLinks = isAdmin
    ? [...links, { href: "/dashboard/admin/users", label: "Admin Users" }, { href: "/dashboard/admin/brands", label: "Admin Brands" }]
    : links;

  return (
    <nav className="mb-6 flex flex-wrap gap-2">
      {navLinks.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
