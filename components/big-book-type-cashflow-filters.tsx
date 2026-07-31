"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  BigBookActor,
  BigBookLedgerType,
  BigBookVendor,
  BigBookVendorType
} from "@/lib/types";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";

const CURRENCY_OPTIONS = [
  { value: "IDR", label: "IDR" },
  { value: "MYR", label: "MYR" },
  { value: "USDT", label: "USDT" },
  { value: "TRX", label: "TRX" }
];

type Props = {
  actors: BigBookActor[];
  types: BigBookLedgerType[];
  vendorTypes: BigBookVendorType[];
  vendors: BigBookVendor[];
  initialActorIds: string[];
  initialTypeIds: string[];
  initialVendorTypeIds: string[];
  initialVendorIds: string[];
  initialCurrencyCodes: string[];
  initialDateFrom: string;
  initialDateTo: string;
};

export function BigBookTypeCashflowFilters({
  actors,
  types,
  vendorTypes,
  vendors,
  initialActorIds,
  initialTypeIds,
  initialVendorTypeIds,
  initialVendorIds,
  initialCurrencyCodes,
  initialDateFrom,
  initialDateTo
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [actorIds, setActorIds] = useState<string[]>(initialActorIds);
  const [typeIds, setTypeIds] = useState<string[]>(initialTypeIds);
  const [vendorTypeIds, setVendorTypeIds] = useState<string[]>(initialVendorTypeIds);
  const [vendorIds, setVendorIds] = useState<string[]>(initialVendorIds);
  const [currencyCodes, setCurrencyCodes] = useState<string[]>(initialCurrencyCodes);
  const [dateFrom, setDateFrom] = useState<string>(initialDateFrom);
  const [dateTo, setDateTo] = useState<string>(initialDateTo);

  const actorOptions = useMemo(
    () =>
      actors.map((actor) => ({
        value: actor.id,
        label: actor.display_name
      })),
    [actors]
  );

  const typeOptions = useMemo(
    () =>
      types.map((type) => ({
        value: type.id,
        label: type.name
      })),
    [types]
  );

  const vendorTypeOptions = useMemo(
    () =>
      vendorTypes
        .filter((row) => row.is_active)
        .map((vendorType) => ({
          value: vendorType.id,
          label: vendorType.name
        })),
    [vendorTypes]
  );

  const vendorOptions = useMemo(() => {
    const filtered = vendors.filter((row) => {
      if (!row.is_active) return false;
      if (!vendorTypeIds.length) return true;
      return vendorTypeIds.includes(row.vendor_type_id);
    });
    return filtered.map((vendor) => ({
      value: vendor.id,
      label: vendor.name
    }));
  }, [vendors, vendorTypeIds]);

  function buildQueryString() {
    const params = new URLSearchParams();
    for (const id of actorIds) params.append("actorId", id);
    for (const id of typeIds) params.append("typeId", id);
    for (const id of vendorTypeIds) params.append("vendorTypeId", id);
    for (const id of vendorIds) params.append("vendorId", id);
    for (const code of currencyCodes) params.append("currencyCode", code);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = `/dashboard/big-book/master-dashboard${buildQueryString()}`;
    startTransition(() => {
      router.push(target);
    });
  }

  function resetFilters() {
    setActorIds([]);
    setTypeIds([]);
    setVendorTypeIds([]);
    setVendorIds([]);
    setCurrencyCodes([]);
    setDateFrom("");
    setDateTo("");
    startTransition(() => {
      router.push("/dashboard/big-book/master-dashboard");
    });
  }

  function onVendorTypeChange(next: string[]) {
    setVendorTypeIds(next);
    if (!next.length) return;
    setVendorIds((prev) =>
      prev.filter((id) => {
        const vendor = vendors.find((row) => row.id === id);
        return vendor ? next.includes(vendor.vendor_type_id) : false;
      })
    );
  }

  return (
    <form className="mt-4 flex flex-col gap-3" onSubmit={applyFilters}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div className="text-sm text-muted">
          <span className="mb-1 block">Actor</span>
          <SearchableMultiSelect
            label="Actor"
            selectedValues={actorIds}
            options={actorOptions}
            onChange={setActorIds}
            searchPlaceholder="Search actor..."
          />
        </div>
        <div className="text-sm text-muted">
          <span className="mb-1 block">Currency</span>
          <SearchableMultiSelect
            label="Currency"
            selectedValues={currencyCodes}
            options={CURRENCY_OPTIONS}
            onChange={setCurrencyCodes}
            searchPlaceholder="Search currency..."
          />
        </div>
        <div className="text-sm text-muted">
          <span className="mb-1 block">Type</span>
          <SearchableMultiSelect
            label="Type"
            selectedValues={typeIds}
            options={typeOptions}
            onChange={setTypeIds}
            searchPlaceholder="Search type..."
          />
        </div>
        <div className="text-sm text-muted">
          <span className="mb-1 block">Vendor Type</span>
          <SearchableMultiSelect
            label="Vendor Type"
            selectedValues={vendorTypeIds}
            options={vendorTypeOptions}
            onChange={onVendorTypeChange}
            searchPlaceholder="Search vendor type..."
          />
        </div>
        <div className="text-sm text-muted">
          <span className="mb-1 block">Vendor</span>
          <SearchableMultiSelect
            label="Vendor"
            selectedValues={vendorIds}
            options={vendorOptions}
            onChange={setVendorIds}
            searchPlaceholder="Search vendor..."
          />
        </div>
        <label className="text-sm text-muted">
          <span className="mb-1 block">Date From</span>
          <input
            className="field w-full"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            aria-label="Filter from date"
          />
        </label>
        <label className="text-sm text-muted">
          <span className="mb-1 block">Date To</span>
          <input
            className="field w-full"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            aria-label="Filter to date"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={resetFilters} disabled={isPending}>
          Reset
        </button>
        <button type="submit" className="btn" disabled={isPending}>
          {isPending ? "Applying..." : "Apply Filters"}
        </button>
      </div>
    </form>
  );
}
