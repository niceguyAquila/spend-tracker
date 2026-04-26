import type { BigBookEntry, BigBookMonthlyCurrencyRow } from "@/lib/types";

export type IndividualTypeLedgerFilters = {
  dateFrom?: string;
  dateTo?: string;
  currencyCode?: string[];
  direction?: Array<"spending" | "profit">;
};

const MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function shouldShowTypeSelector(selectedTypeId: string) {
  return !selectedTypeId;
}

export function filterIndividualTypeEntries(entries: BigBookEntry[], filters: IndividualTypeLedgerFilters): BigBookEntry[] {
  return entries.filter((entry) => {
    if (filters.dateFrom && entry.entry_date < filters.dateFrom) return false;
    if (filters.dateTo && entry.entry_date > filters.dateTo) return false;
    if (filters.currencyCode?.length && !filters.currencyCode.includes(entry.currency_code)) return false;
    if (filters.direction?.length && !filters.direction.includes(entry.entry_direction)) return false;
    return true;
  });
}

export function buildIndividualTypeMonthlySummary(entries: BigBookEntry[], year: number): BigBookMonthlyCurrencyRow[] {
  const rows: BigBookMonthlyCurrencyRow[] = MONTH_LABELS.map((monthLabel, index) => ({
    month_index: index + 1,
    month_label: monthLabel,
    totals: { IDR: 0, MYR: 0, USDT: 0 }
  }));

  for (const entry of entries) {
    const entryYear = Number(entry.entry_date.slice(0, 4));
    if (entryYear !== year) continue;
    const month = Number(entry.entry_date.slice(5, 7));
    if (!Number.isFinite(month) || month < 1 || month > 12) continue;
    if (entry.currency_code === "TRX") continue;
    const signedAmount = entry.entry_direction === "spending" ? -Math.abs(entry.amount) : Math.abs(entry.amount);
    rows[month - 1].totals[entry.currency_code] += signedAmount;
  }

  return rows;
}
