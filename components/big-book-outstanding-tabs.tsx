"use client";

import { useState } from "react";
import type {
  BigBookVendorActorOutstandingDebtRow,
  BigBookVendorActorOutstandingRow
} from "@/lib/types";
import { BigBookVendorActorOutstandingTable } from "@/components/big-book-vendor-actor-outstanding-table";
import { BigBookVendorActorOutstandingFutureTable } from "@/components/big-book-vendor-actor-outstanding-future-table";
import { BigBookVendorActorOutstandingDebtTable } from "@/components/big-book-vendor-actor-outstanding-debt-table";
import { SettingsCategoryTabBar } from "@/components/settings-category-tab-bar";
import type { SettingsCategoryTab } from "@/lib/ui/settings-tabs";
import type { OutstandingDetailFilters } from "@/components/big-book-vendor-actor-outstanding-table";

type OutstandingTabId = "credit" | "future-credit" | "debt";

const OUTSTANDING_TABS: readonly SettingsCategoryTab<OutstandingTabId>[] = [
  { id: "credit", label: "Credit" },
  { id: "future-credit", label: "Future Credit" },
  { id: "debt", label: "Debt" }
];

type Props = {
  vendorActorOutstanding: BigBookVendorActorOutstandingRow[];
  vendorActorOutstandingFuture: BigBookVendorActorOutstandingRow[];
  vendorActorOutstandingDebt: BigBookVendorActorOutstandingDebtRow[];
  detailFilters?: OutstandingDetailFilters;
  onChanged?: () => void;
  /** Optional heading above the tab bar. */
  title?: string;
  description?: string;
};

export function BigBookOutstandingTabs({
  vendorActorOutstanding,
  vendorActorOutstandingFuture,
  vendorActorOutstandingDebt,
  detailFilters,
  onChanged,
  title = "Outstanding by Vendor / Group and Actor",
  description = "Credit and Future Credit can be settled or invoiced. Credit is grouped by Vendor Type + Actor + Currency; Future Credit by ledger Type + Actor + Currency and stays out of cash totals until Actualize. Debt payments create Out ledger entries."
}: Props) {
  const [outstandingTab, setOutstandingTab] = useState<OutstandingTabId>("credit");

  return (
    <section className="card min-w-0 overflow-hidden">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <div className="mt-4">
        <SettingsCategoryTabBar
          tabs={OUTSTANDING_TABS}
          activeTab={outstandingTab}
          onChange={setOutstandingTab}
          ariaLabel="Outstanding categories"
        />
      </div>

      {outstandingTab === "credit" ? (
        <div className="mt-4">
          <h3 className="text-base font-semibold">Outstanding Credit by Vendor Type and Actor</h3>
          <p className="mt-1 text-sm text-muted">
            Open actualized credits (not yet marked settled) by vendor type and actor, per currency. The
            Vendor (Owes) column is the vendor-type bucket (mirroring Type on Future Credit). Expand a row
            to see credits grouped by ledger Type with vendor names. Settle one row or multi-select for bulk
            settlement.
          </p>
          <BigBookVendorActorOutstandingTable
            rows={vendorActorOutstanding}
            detailFilters={detailFilters}
            onSettled={onChanged}
          />
        </div>
      ) : null}

      {outstandingTab === "future-credit" ? (
        <div className="mt-4">
          <h3 className="text-base font-semibold">Outstanding Future Credit by Type and Actor</h3>
          <p className="mt-1 text-sm text-muted">
            Obligations expected later, grouped by Type + Actor + Currency — excluded from cash
            totals until Actualize. Settlements (inflow) are allowed without actualizing first.
          </p>
          <BigBookVendorActorOutstandingFutureTable
            rows={vendorActorOutstandingFuture}
            detailFilters={detailFilters}
            onActualized={onChanged}
          />
        </div>
      ) : null}

      {outstandingTab === "debt" ? (
        <div className="mt-4">
          <h3 className="text-base font-semibold">
            Outstanding Debt by Grouped Transaction and Actor
          </h3>
          <p className="mt-1 text-sm text-muted">
            Open debts (we owe the counterparty, not yet settled) by grouped transaction and actor,
            per currency. Ungrouped debts appear as their own row. Amounts are shown in red. Record
            payment creates an Out ledger entry that hits totals and can close the debt.
          </p>
          <BigBookVendorActorOutstandingDebtTable
            rows={vendorActorOutstandingDebt}
            detailFilters={detailFilters}
            onSettled={onChanged}
          />
        </div>
      ) : null}
    </section>
  );
}
