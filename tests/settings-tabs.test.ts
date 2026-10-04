import { describe, expect, it } from "vitest";
import {
  DANGER_ZONE_TAB_ID,
  orderSettingsTabs,
  resolveSettingsTab,
  type SettingsCategoryTab
} from "@/lib/ui/settings-tabs";

describe("resolveSettingsTab", () => {
  const ids = ["types", "actors", "danger-zone"] as const;

  it("returns the matching tab id", () => {
    expect(resolveSettingsTab("actors", ids, "types")).toBe("actors");
  });

  it("falls back when missing or invalid", () => {
    expect(resolveSettingsTab(null, ids, "types")).toBe("types");
    expect(resolveSettingsTab("nope", ids, "types")).toBe("types");
  });
});

describe("orderSettingsTabs", () => {
  it("keeps Danger zone last even if supplied earlier", () => {
    const tabs: SettingsCategoryTab[] = [
      { id: DANGER_ZONE_TAB_ID, label: "Danger zone" },
      { id: "types", label: "Types" },
      { id: "actors", label: "Actors" }
    ];
    expect(orderSettingsTabs(tabs).map((tab) => tab.id)).toEqual([
      "types",
      "actors",
      DANGER_ZONE_TAB_ID
    ]);
  });
});
