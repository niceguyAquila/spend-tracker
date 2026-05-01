"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BrandSwitcher } from "@/components/brand-switcher";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import type { AppRole } from "@/lib/types";

type NavLink = {
  href: string;
  label: string;
  isActive: (pathname: string, searchParams: URLSearchParams) => boolean;
};

type NavModule = {
  title: string;
  isModuleActive: (pathname: string) => boolean;
  links: NavLink[];
};

type DashboardSidebarProps = {
  globalRole: AppRole;
  role: AppRole;
  activeBrandId: string;
  brandOptions: Array<{ id: string; name: string }>;
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
};

const MODULE_ICONS: Record<string, string> = {
  "Web Spending": "/asset/wallet.png",
  "Web Transaction": "/asset/transaction.png",
  "Transaction Big Book": "/asset/accounting-book.png",
  "Credit Big Book": "/asset/accounting-book.png",
  Admin: "/asset/admin.png"
};

function SidebarHamburgerIcon() {
  return (
    <span className="flex h-4 w-4 flex-col items-center justify-center gap-1" aria-hidden="true">
      <span className="block h-0.5 w-4 rounded bg-current" />
      <span className="block h-0.5 w-4 rounded bg-current" />
      <span className="block h-0.5 w-4 rounded bg-current" />
    </span>
  );
}

function createNavModules(globalRole: AppRole, role: AppRole): NavModule[] {
  const canManageCategories = role === "finance" || role === "admin";
  const modules: NavModule[] = [
    {
      title: "Web Spending",
      isModuleActive: (pathname) => pathname.startsWith("/dashboard/spending") || pathname.startsWith("/dashboard/settings/categories"),
      links: [
        {
          href: "/dashboard/spending/overview",
          label: "Overview",
          isActive: (pathname) => pathname === "/dashboard/spending/overview"
        },
        {
          href: "/dashboard/spending/entries",
          label: "Add Spending",
          isActive: (pathname) => pathname === "/dashboard/spending/entries"
        }
      ]
    },
    {
      title: "Web Transaction",
      isModuleActive: (pathname) => pathname.startsWith("/dashboard/transactions"),
      links: [
        {
          href: "/dashboard/transactions?source=backoffice",
          label: "Backoffice",
          isActive: (pathname, searchParams) =>
            pathname === "/dashboard/transactions" && searchParams.get("source") === "backoffice"
        },
        {
          href: "/dashboard/transactions?source=payment_gateway",
          label: "Payment Gateway",
          isActive: (pathname, searchParams) =>
            pathname === "/dashboard/transactions" &&
            (searchParams.get("source") === "payment_gateway" || searchParams.get("source") === null)
        },
        {
          href: "/dashboard/transactions/comparison",
          label: "Comparison",
          isActive: (pathname) => pathname === "/dashboard/transactions/comparison"
        }
      ]
    }
  ];

  if (canManageCategories) {
    modules[0].links.push({
      href: "/dashboard/settings/categories",
      label: "Add Category",
      isActive: (pathname) => pathname === "/dashboard/settings/categories"
    });
  }

  if (globalRole === "admin") {
    modules.push({
      title: "Transaction Big Book",
      isModuleActive: (pathname) => pathname.startsWith("/dashboard/big-book"),
      links: [
        {
          href: "/dashboard/big-book/master-dashboard",
          label: "Master Dashboard",
          isActive: (pathname) => pathname === "/dashboard/big-book/master-dashboard"
        },
        {
          href: "/dashboard/big-book",
          label: "Transaction Dashboard",
          isActive: (pathname) => pathname === "/dashboard/big-book"
        },
        {
          href: "/dashboard/big-book/individual-type-ledger",
          label: "Transaction Type Dashboard",
          isActive: (pathname) => pathname === "/dashboard/big-book/individual-type-ledger"
        },
        {
          href: "/dashboard/big-book/settings",
          label: "Settings",
          isActive: (pathname) => pathname === "/dashboard/big-book/settings"
        },
        {
          href: "/dashboard/big-book/exchange-helper",
          label: "Exchange Helper",
          isActive: (pathname) => pathname === "/dashboard/big-book/exchange-helper"
        }
      ]
    });
    modules.push({
      title: "Credit Big Book",
      isModuleActive: (pathname) => pathname.startsWith("/dashboard/credit-big-book"),
      links: [
        {
          href: "/dashboard/credit-big-book/master-dashboard",
          label: "Master Dashboard",
          isActive: (pathname) => pathname === "/dashboard/credit-big-book/master-dashboard"
        },
        {
          href: "/dashboard/credit-big-book",
          label: "Credit Dashboard",
          isActive: (pathname) => pathname === "/dashboard/credit-big-book"
        },
        {
          href: "/dashboard/credit-big-book/individual-type-ledger",
          label: "Credit Type Dashboard",
          isActive: (pathname) => pathname === "/dashboard/credit-big-book/individual-type-ledger"
        },
        {
          href: "/dashboard/credit-big-book/settings",
          label: "Settings",
          isActive: (pathname) => pathname === "/dashboard/credit-big-book/settings"
        },
        {
          href: "/dashboard/credit-big-book/exchange-helper",
          label: "Exchange Helper",
          isActive: (pathname) => pathname === "/dashboard/credit-big-book/exchange-helper"
        }
      ]
    });
    modules.push({
      title: "Admin",
      isModuleActive: (pathname) =>
        pathname.startsWith("/dashboard/master-dashboard") ||
        pathname.startsWith("/dashboard/admin/users") ||
        pathname.startsWith("/dashboard/admin/brands"),
      links: [
        {
          href: "/dashboard/master-dashboard",
          label: "Master Dashboard",
          isActive: (pathname) => pathname.startsWith("/dashboard/master-dashboard")
        },
        {
          href: "/dashboard/admin/users",
          label: "Admin Users",
          isActive: (pathname) => pathname.startsWith("/dashboard/admin/users")
        },
        {
          href: "/dashboard/admin/brands",
          label: "Admin Brands",
          isActive: (pathname) => pathname.startsWith("/dashboard/admin/brands")
        }
      ]
    });
  }

  return modules;
}

function getSubmenuItemClassName(isActive: boolean) {
  return `block rounded-md border px-3 py-2 text-sm transition-colors duration-200 ease-out ${
    isActive
      ? "border-[rgb(var(--primary))] bg-[rgb(var(--primary))] text-white hover:bg-[rgb(var(--primary-strong))]"
      : "border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-muted))]"
  }`;
}

export function DashboardSidebar({
  globalRole,
  role,
  activeBrandId,
  brandOptions,
  onNavigate,
  collapsed = false,
  onToggleCollapsed
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const modules = useMemo(() => createNavModules(globalRole, role), [globalRole, role]);
  const shouldHideBrandSwitcher =
    pathname.startsWith("/dashboard/master-dashboard") ||
    pathname.startsWith("/dashboard/big-book") ||
    pathname.startsWith("/dashboard/credit-big-book");
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenModules((previous) => {
      const next = { ...previous };
      for (const navModule of modules) {
        if (next[navModule.title] === undefined) {
          next[navModule.title] = navModule.isModuleActive(pathname);
        } else if (navModule.isModuleActive(pathname)) {
          next[navModule.title] = true;
        }
      }
      return next;
    });
  }, [modules, pathname]);

  function getModuleIconSrc(title: string): string | undefined {
    return MODULE_ICONS[title];
  }

  return (
    <div className={`flex h-full flex-col overflow-y-auto ${collapsed ? "p-2" : "p-4 lg:p-5"}`}>
      {onToggleCollapsed ? (
        <div
          className={`mb-3 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}
        >
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] transition-colors duration-200 ease-out hover:bg-[rgb(var(--surface-muted))]"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            <SidebarHamburgerIcon />
          </button>
          {!collapsed ? (
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Navigation
            </span>
          ) : null}
        </div>
      ) : null}

      {!collapsed && !shouldHideBrandSwitcher ? (
        <div className="mb-4 border-b border-[rgb(var(--border))] pb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Brand</p>
          <BrandSwitcher activeBrandId={activeBrandId} options={brandOptions} compact />
        </div>
      ) : null}

      <div className="space-y-3">
        {modules.map((navModule) => {
          const isOpen = openModules[navModule.title] ?? false;
          const isActiveModule = navModule.isModuleActive(pathname);
          const iconSrc = getModuleIconSrc(navModule.title);

          return (
            <section
              key={navModule.title}
              className={
                collapsed
                  ? "border-0 bg-transparent p-0"
                  : "rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2"
              }
            >
              <button
                type="button"
                onClick={() =>
                  setOpenModules((previous) => ({
                    ...previous,
                    [navModule.title]: !isOpen
                  }))
                }
                className={`flex items-center text-left text-sm font-semibold transition-colors duration-200 ease-out ${
                  collapsed
                    ? "mx-auto h-10 w-10 justify-center rounded-full p-0"
                    : "w-full justify-between gap-2 rounded-md px-2 py-2"
                } ${
                  isActiveModule
                    ? "text-[rgb(var(--primary))]"
                    : "text-[rgb(var(--text))] hover:bg-[rgb(var(--surface-muted))]"
                }`}
                title={navModule.title}
                aria-expanded={isOpen}
                aria-controls={`sidebar-module-${navModule.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {collapsed ? (
                  <span
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${
                      isActiveModule
                        ? "border-[rgb(var(--primary))] bg-[rgb(var(--primary))]"
                        : "border-[rgb(var(--border))] bg-[rgb(var(--surface-muted))]"
                    }`}
                    aria-hidden="true"
                  >
                    {iconSrc ? (
                      <Image
                        src={iconSrc}
                        alt=""
                        width={22}
                        height={22}
                        className="h-[22px] w-[22px] object-contain"
                      />
                    ) : null}
                  </span>
                ) : (
                  <>
                    <span className="flex min-w-0 items-center gap-2">
                      {iconSrc ? (
                        <Image
                          src={iconSrc}
                          alt=""
                          width={22}
                          height={22}
                          className="h-[22px] w-[22px] shrink-0 object-contain"
                        />
                      ) : null}
                      <span className="truncate">{navModule.title}</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`text-xs transition-transform duration-300 ease-out ${isOpen ? "rotate-180" : ""}`}
                    >
                      v
                    </span>
                  </>
                )}
              </button>

              <div
                id={`sidebar-module-${navModule.title.toLowerCase().replace(/\s+/g, "-")}`}
                className={`${!collapsed && isOpen ? "mt-2 space-y-2" : "hidden"}`}
              >
                {navModule.links.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={getSubmenuItemClassName(item.isActive(pathname, searchParams))}
                    onClick={onNavigate}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className={`mt-auto ${collapsed ? "pt-3" : "pt-5"}`}>
        <div className="space-y-2">
          <div
            className={`rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] ${
              collapsed ? "flex justify-center p-1.5" : "p-2"
            }`}
          >
            <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between gap-2"}`}>
              {!collapsed ? (
                <span className="px-2 text-sm font-semibold text-[rgb(var(--text))]">Theme</span>
              ) : null}
              <ThemeToggle compact={collapsed} />
            </div>
          </div>
          <div
            className={`rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] ${
              collapsed ? "flex justify-center p-1.5" : "p-2"
            }`}
          >
            <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between gap-2"}`}>
              {!collapsed ? <span className="px-2 text-sm font-semibold text-[rgb(var(--text))]">Logout</span> : null}
              <LogoutButton />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
