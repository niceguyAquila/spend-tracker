"use client";

import { useEffect, useRef, useState } from "react";
import { DashboardHeaderTitle } from "@/components/dashboard-header-title";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import type { AppRole } from "@/lib/types";

type DashboardShellProps = {
  userEmail: string;
  role: AppRole;
  globalRole: AppRole;
  activeBrandId: string;
  activeBrandName: string;
  brandOptions: Array<{ id: string; name: string }>;
  children: React.ReactNode;
};

function HamburgerIcon() {
  return (
    <span className="flex h-4 w-4 flex-col items-center justify-center gap-1" aria-hidden="true">
      <span className="block h-0.5 w-4 rounded bg-current" />
      <span className="block h-0.5 w-4 rounded bg-current" />
      <span className="block h-0.5 w-4 rounded bg-current" />
    </span>
  );
}

export function DashboardShell({
  userEmail,
  role,
  globalRole,
  activeBrandId,
  activeBrandName,
  brandOptions,
  children
}: DashboardShellProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const [isDesktopSidebarHovered, setIsDesktopSidebarHovered] = useState(false);
  const sidebarHoverLeaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Visual width: hover expands the sidebar only when collapsed. This is decoupled
  // from the layout width below so that hover overlays content instead of pushing it.
  const isDesktopSidebarVisuallyExpanded = !isDesktopSidebarCollapsed || isDesktopSidebarHovered;
  // Layout width (the space reserved for the sidebar in the page) is driven only by
  // the persistent collapsed state so hovering does not reflow the page content.
  const isHoverOverlay = isDesktopSidebarCollapsed && isDesktopSidebarHovered;

  function handleDesktopSidebarMouseEnter() {
    if (sidebarHoverLeaveTimeoutRef.current) {
      clearTimeout(sidebarHoverLeaveTimeoutRef.current);
      sidebarHoverLeaveTimeoutRef.current = null;
    }
    setIsDesktopSidebarHovered(true);
  }

  function handleDesktopSidebarMouseLeave() {
    if (sidebarHoverLeaveTimeoutRef.current) {
      clearTimeout(sidebarHoverLeaveTimeoutRef.current);
    }
    // Slight delay prevents abrupt collapse when cursor briefly exits.
    sidebarHoverLeaveTimeoutRef.current = setTimeout(() => {
      setIsDesktopSidebarHovered(false);
      sidebarHoverLeaveTimeoutRef.current = null;
    }, 140);
  }

  useEffect(() => {
    if (!isMobileSidebarOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMobileSidebarOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobileSidebarOpen]);

  useEffect(() => {
    return () => {
      if (sidebarHoverLeaveTimeoutRef.current) {
        clearTimeout(sidebarHoverLeaveTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <aside
        className={`hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block lg:border-r lg:border-[rgb(var(--border))] lg:bg-[rgb(var(--surface-muted))] transition-[width,box-shadow] duration-300 ease-out ${
          isDesktopSidebarVisuallyExpanded ? "lg:w-[280px]" : "lg:w-[72px]"
        } ${
          isHoverOverlay
            ? "lg:shadow-[0_24px_60px_-12px_rgba(15,23,42,0.55)]"
            : "lg:shadow-[0_0_24px_-12px_rgba(15,23,42,0.45)]"
        }`}
        onMouseEnter={handleDesktopSidebarMouseEnter}
        onMouseLeave={handleDesktopSidebarMouseLeave}
      >
        <DashboardSidebar
          globalRole={globalRole}
          role={role}
          activeBrandId={activeBrandId}
          brandOptions={brandOptions}
          collapsed={!isDesktopSidebarVisuallyExpanded}
          onToggleCollapsed={() => setIsDesktopSidebarCollapsed((value) => !value)}
        />
      </aside>
      <main
        className={`min-h-screen w-full transition-[padding] duration-300 ease-out ${
          isDesktopSidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-[280px]"
        }`}
      >
        <div className="px-3 py-6 sm:px-4 lg:px-8 lg:py-8">
          <section className="min-w-0">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-4 lg:mb-8 lg:gap-6">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] transition hover:bg-[rgb(var(--surface-muted))] lg:hidden"
                  aria-label="Open navigation menu"
                  title="Open navigation menu"
                  onClick={() => setIsMobileSidebarOpen(true)}
                >
                  <HamburgerIcon />
                </button>
                <div className="max-w-3xl space-y-1">
                  <DashboardHeaderTitle activeBrandName={activeBrandName} />
                  <p className="text-sm text-muted">
                    Unified workspace for spending, transactions, big book ledgers, and admin controls.
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end text-right">
                <div className="flex items-start gap-2">
                  <div>
                    <p className="text-sm text-muted">{userEmail}</p>
                    <p className="mt-1 text-xs uppercase text-muted">{role}</p>
                  </div>
                  <ThemeToggle />
                  <div className="pt-0.5">
                    <LogoutButton />
                  </div>
                </div>
              </div>
            </header>
            {children}
          </section>
        </div>
      </main>

      {isMobileSidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close navigation menu"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <aside className="relative h-full w-[86vw] max-w-xs border-r border-[rgb(var(--border))] bg-[rgb(var(--surface))]">
            <div className="flex items-center justify-between border-b border-[rgb(var(--border))] px-4 py-3">
              <p className="text-sm font-semibold text-[rgb(var(--text))]">Navigation</p>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[rgb(var(--border))] bg-[rgb(var(--surface))] text-[rgb(var(--text))] transition hover:bg-[rgb(var(--surface-muted))]"
                aria-label="Close navigation menu"
                onClick={() => setIsMobileSidebarOpen(false)}
              >
                <span aria-hidden="true">X</span>
              </button>
            </div>
            <DashboardSidebar
              globalRole={globalRole}
              role={role}
              activeBrandId={activeBrandId}
              brandOptions={brandOptions}
              onNavigate={() => setIsMobileSidebarOpen(false)}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}
