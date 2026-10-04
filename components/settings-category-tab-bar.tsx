"use client";

import type { ReactNode } from "react";
import {
  DANGER_ZONE_TAB_ID,
  orderSettingsTabs,
  type SettingsCategoryTab,
  type SettingsTabIconName
} from "@/lib/ui/settings-tabs";

type Props<T extends string> = {
  tabs: readonly SettingsCategoryTab<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
};

function TabIcon({ name }: { name: SettingsTabIconName }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    className: "settings-category-tab__icon"
  };

  switch (name) {
    case "types":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M4 12h10" />
          <path d="M4 17h14" />
        </svg>
      );
    case "vendor-types":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 10h18" />
        </svg>
      );
    case "vendors":
      return (
        <svg {...common}>
          <path d="M3 7h18l-2 12H5L3 7z" />
          <path d="M8 7V5a4 4 0 0 1 8 0v2" />
        </svg>
      );
    case "action-by":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 19a7 7 0 0 1 14 0" />
        </svg>
      );
    case "pockets":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
          <path d="M16 14h2" />
        </svg>
      );
    case "wallets":
      return (
        <svg {...common}>
          <rect x="2" y="6" width="20" height="14" rx="2" />
          <path d="M16 12h4" />
          <path d="M2 10h20" />
        </svg>
      );
    case "actors":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M3 19a6 6 0 0 1 12 0" />
          <path d="M14 19a4.5 4.5 0 0 1 7 0" />
        </svg>
      );
    case "type-vendor-map":
      return (
        <svg {...common}>
          <path d="M8 6h8" />
          <path d="M8 12h8" />
          <path d="M8 18h8" />
          <path d="M6 6v12" />
          <path d="M18 6v12" />
        </svg>
      );
    case "invoice-presets":
      return (
        <svg {...common}>
          <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6" />
          <path d="M9 17h4" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "danger-zone":
      return (
        <svg {...common}>
          <path d="M12 3 2 20h20L12 3z" />
          <path d="M12 9v5" />
          <path d="M12 17h.01" />
        </svg>
      );
    default:
      return null;
  }
}

export function SettingsCategoryTabBar<T extends string>({ tabs, activeTab, onChange }: Props<T>) {
  const ordered = orderSettingsTabs(tabs);

  return (
    <div className="settings-category-tab-bar" role="tablist" aria-label="Settings categories">
      <div className="settings-category-tab-bar__inner">
        {ordered.map((tab) => {
          const isActive = tab.id === activeTab;
          const isDanger = tab.id === DANGER_ZONE_TAB_ID;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`settings-category-tab${isActive ? " is-active" : ""}${isDanger ? " is-danger" : ""}`}
              onClick={() => onChange(tab.id)}
            >
              {tab.icon ? <TabIcon name={tab.icon} /> : null}
              <span className="settings-category-tab__label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsDangerZonePanel({
  children
}: {
  children?: ReactNode;
}) {
  return (
    <section className="card">
      <h2 className="text-lg font-semibold">Danger zone</h2>
      <p className="mt-1 text-sm text-muted">
        Permanent deletes clear the field on existing ledger rows. Soft deactivate/activate stays on
        each category tab.
      </p>
      {children}
    </section>
  );
}
