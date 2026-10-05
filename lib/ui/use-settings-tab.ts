"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { resolveSettingsTab } from "@/lib/ui/settings-tabs";

type UseSettingsTabResult<T extends string> = {
  activeTab: T;
  setTab: (tab: T) => void;
};

/**
 * Keeps Settings category selection in sync with `?tab=`.
 * Writes the param on every change (including default) so deep links stay shareable.
 */
export function useSettingsTab<T extends string>(
  tabIds: readonly T[],
  defaultTab: T
): UseSettingsTabResult<T> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const activeTab = useMemo(
    () => resolveSettingsTab(tabParam, tabIds, defaultTab),
    [tabParam, tabIds, defaultTab]
  );

  const setTab = useCallback(
    (tab: T) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  // Normalize missing/invalid ?tab= so URL sync holds on every layout.
  useEffect(() => {
    if (tabParam === activeTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", activeTab);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // searchParams intentionally read inside; tabParam/activeTab drive when to rewrite.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid replace loops on new searchParams identity
  }, [activeTab, pathname, router, tabParam]);

  return { activeTab, setTab };
}
