"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoadingIndicator } from "@/components/ui/loading-indicator";

type Props = {
  sourceSystem: "backoffice" | "payment_gateway";
  statusOptions: string[];
  typeOptions: string[];
  merchantOptions: string[];
  selectedStatus: string | null;
  selectedCanonicalType: string | null;
  selectedMerchantName: string | null;
  selectedDateFrom: string | null;
  selectedDateTo: string | null;
};

export function WebTransactionsFilters({
  sourceSystem,
  statusOptions,
  typeOptions,
  merchantOptions,
  selectedStatus,
  selectedCanonicalType,
  selectedMerchantName,
  selectedDateFrom,
  selectedDateTo
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function applyFilters(formData: FormData) {
    const params = new URLSearchParams();
    params.set("source", sourceSystem);
    const status = String(formData.get("status") ?? "").trim();
    const canonicalType = String(formData.get("canonicalType") ?? "").trim();
    const merchantName = String(formData.get("merchantName") ?? "").trim();
    const dateFrom = String(formData.get("dateFrom") ?? "").trim();
    const dateTo = String(formData.get("dateTo") ?? "").trim();
    if (status) params.set("status", status);
    if (canonicalType) params.set("canonicalType", canonicalType);
    if (merchantName) params.set("merchantName", merchantName);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function clearFilters() {
    startTransition(() => {
      router.push(`${pathname}?source=${sourceSystem}`);
    });
  }

  return (
    <form action={applyFilters} className="card grid grid-cols-1 gap-3 lg:grid-cols-5" aria-busy={isPending}>
      <label className="text-sm text-slate-700">
        <span className="mb-1 block">Status</span>
        <select name="status" defaultValue={selectedStatus ?? ""} className="field" disabled={isPending}>
          <option value="">All status</option>
          {statusOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-slate-700">
        <span className="mb-1 block">Type</span>
        <select name="canonicalType" defaultValue={selectedCanonicalType ?? ""} className="field" disabled={isPending}>
          <option value="">All types</option>
          {typeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-slate-700">
        <span className="mb-1 block">Merchant</span>
        <select name="merchantName" defaultValue={selectedMerchantName ?? ""} className="field" disabled={isPending}>
          <option value="">All merchants</option>
          {merchantOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-slate-700">
        <span className="mb-1 block">Date From</span>
        <input name="dateFrom" type="date" defaultValue={selectedDateFrom ?? ""} className="field" disabled={isPending} />
      </label>
      <label className="text-sm text-slate-700">
        <span className="mb-1 block">Date To</span>
        <input name="dateTo" type="date" defaultValue={selectedDateTo ?? ""} className="field" disabled={isPending} />
      </label>
      <div className="flex items-center gap-2 lg:col-span-5">
        <button className="btn" type="submit" disabled={isPending}>
          {isPending ? "Applying..." : "Apply Filters"}
        </button>
        <button className="btn-secondary" type="button" onClick={clearFilters} disabled={isPending}>
          Clear
        </button>
        {isPending ? <LoadingIndicator label="Updating results..." /> : null}
      </div>
    </form>
  );
}
