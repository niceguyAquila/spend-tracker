export type SettingsCategoryTab<T extends string = string> = {
  id: T;
  label: string;
  icon?: SettingsTabIconName;
};

export type SettingsTabIconName =
  | "types"
  | "vendor-types"
  | "vendors"
  | "action-by"
  | "pockets"
  | "wallets"
  | "actors"
  | "type-vendor-map"
  | "invoice-presets"
  | "danger-zone";

export const DANGER_ZONE_TAB_ID = "danger-zone" as const;

/** Resolve `?tab=` against known ids; invalid/missing falls back to default. */
export function resolveSettingsTab<T extends string>(
  tabParam: string | null | undefined,
  tabIds: readonly T[],
  defaultTab: T
): T {
  if (tabParam && (tabIds as readonly string[]).includes(tabParam)) {
    return tabParam as T;
  }
  return defaultTab;
}

/** Ensure Danger zone stays last when present. */
export function orderSettingsTabs<T extends SettingsCategoryTab>(tabs: readonly T[]): T[] {
  const danger = tabs.filter((tab) => tab.id === DANGER_ZONE_TAB_ID);
  const rest = tabs.filter((tab) => tab.id !== DANGER_ZONE_TAB_ID);
  return [...rest, ...danger];
}
