"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { WebTransactionComparisonOutcome } from "@/lib/types";
import { LoadingIndicator } from "@/components/ui/loading-indicator";

type ComparisonOption = { value: WebTransactionComparisonOutcome; label: string };

type Props = {
  outcomeOptions: ComparisonOption[];
  selectedStatus: string | null;
  selectedCanonicalType: string | null;
  selectedTransactionNo: string | null;
  selectedDateFrom: string | null;
  selectedDateTo: string | null;
  selectedOutcome: WebTransactionComparisonOutcome | null;
};

export function WebTransactionsComparisonFilters({
  outcomeOptions,
  selectedStatus,
  selectedCanonicalType,
  selectedTransactionNo,
  selectedDateFrom,
  selectedDateTo,
  selectedOutcome
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function applyFilters(formData: FormData) {
    const params = new URLSearchParams();
    const transactionNo = String(formData.get("transactionNo") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();
    const canonicalType = String(formData.get("canonicalType") ?? "").trim();
    const outcome = String(formData.get("outcome") ?? "").trim();
    const dateFrom = String(formData.get("dateFrom") ?? "").trim();
    const dateTo = String(formData.get("dateTo") ?? "").trim();
    if (transactionNo) params.set("transactionNo", transactionNo);
    if (status) params.set("status", status);
    if (canonicalType) params.set("canonicalType", canonicalType);
    if (outcome) params.set("outcome", outcome);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  function clearFilters() {
    startTransition(() => {
      router.push(pathname);
    });
  }

  return (
    <form action={applyFilters} className="card grid grid-cols-1 gap-3 xl:grid-cols-6" aria-busy={isPending}>
      <label className="text-sm text-slate-700">
        <span className="mb-1 block">Transaction No</span>
        <input
          name="transactionNo"
          type="text"
          defaultValue={selectedTransactionNo ?? ""}
          className="field"
          placeholder="Contains..."
          disabled={isPending}
        />
      </label>
      <label className="text-sm text-slate-700">
        <span className="mb-1 block">Status</span>
        <input
          name="status"
          type="text"
          defaultValue={selectedStatus ?? ""}
          className="field"
          placeholder="Successful / Pending..."
          disabled={isPending}
        />
      </label>
      <label className="text-sm text-slate-700">
        <span className="mb-1 block">Type</span>
        <select name="canonicalType" defaultValue={selectedCanonicalType ?? ""} className="field" disabled={isPending}>
          <option value="">All types</option>
          <option value="Payin">Payin</option>
          <option value="Payout">Payout</option>
          <option value="Other">Other</option>
        </select>
      </label>
      <label className="text-sm text-slate-700">
        <span className="mb-1 block">Result</span>
        <select name="outcome" defaultValue={selectedOutcome ?? ""} className="field" disabled={isPending}>
          <option value="">All results</option>
          {outcomeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
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
      <div className="flex items-center gap-2 xl:col-span-6">
        <button className="btn" type="submit" disabled={isPending}>
          {isPending ? "Applying..." : "Apply Filters"}
        </button>
        <button className="btn-secondary" type="button" onClick={clearFilters} disabled={isPending}>
          Clear
        </button>
        {isPending ? <LoadingIndicator label="Updating comparison..." /> : null}
      </div>
    </form>
  );
}
