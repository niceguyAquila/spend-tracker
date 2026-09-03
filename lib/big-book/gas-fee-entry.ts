export const BIG_BOOK_GROUP_ENTRY_MAX = 50;
export const GAS_FEE_CURRENCY = "TRX" as const;
export const GAS_FEE_EXPLANATION_MAX = 500;
export const GAS_FEE_GROUP_LABEL_MAX = 200;

export type GasFeeSourceEntry = {
  entry_date: string;
  entry_type_id: string;
  entry_sub_type_id?: string | null;
  vendor_type_id?: string | null;
  vendor_id?: string | null;
  action_by_id?: string | null;
  explanation: string;
  responsible_actor_id: string;
};

export type BigBookGasFeeEntryPayload = {
  entry_date: string;
  entry_direction: "spending";
  entry_type_id: string;
  entry_sub_type_id: string | null;
  vendor_type_id: string | null;
  vendor_id: string | null;
  pocket_id: null;
  action_by_id: string | null;
  explanation: string;
  amount: number;
  currency_code: typeof GAS_FEE_CURRENCY;
  remark: string;
  responsible_actor_id: string;
};

/** Empty, invalid, or non-positive amounts mean "skip the companion row". */
export function parseOptionalGasFeeAmount(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const raw = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw;
}

export function willCreateGasFeeEntry(
  currencyCode: string,
  gasFeeAmount: string | number | null | undefined
) {
  return currencyCode === "USDT" && parseOptionalGasFeeAmount(gasFeeAmount) != null;
}

export function buildGasFeeExplanation(mainExplanation: string) {
  const combined = `Gas fee — ${mainExplanation.trim()}`;
  if (combined.length <= GAS_FEE_EXPLANATION_MAX) return combined;
  return combined.slice(0, GAS_FEE_EXPLANATION_MAX);
}

export function buildGasFeeGroupLabel(explanation: string) {
  const trimmed = explanation.trim();
  return trimmed.slice(0, GAS_FEE_GROUP_LABEL_MAX);
}

export function buildGasFeeEntry(main: GasFeeSourceEntry, gasAmount: number): BigBookGasFeeEntryPayload {
  return {
    entry_date: main.entry_date,
    entry_direction: "spending",
    entry_type_id: main.entry_type_id,
    entry_sub_type_id: main.entry_sub_type_id ?? null,
    vendor_type_id: main.vendor_type_id ?? null,
    vendor_id: main.vendor_id ?? null,
    pocket_id: null,
    action_by_id: main.action_by_id ?? null,
    explanation: buildGasFeeExplanation(main.explanation),
    amount: gasAmount,
    currency_code: GAS_FEE_CURRENCY,
    remark: "",
    responsible_actor_id: main.responsible_actor_id
  };
}

export function expandGroupPayloadsWithGasFees<
  T extends GasFeeSourceEntry & { amount: number; currency_code: string }
>(items: Array<{ entry: T; gasFeeAmount?: string | number | null }>): Array<T | BigBookGasFeeEntryPayload> {
  const expanded: Array<T | BigBookGasFeeEntryPayload> = [];
  for (const item of items) {
    expanded.push(item.entry);
    if (item.entry.currency_code !== "USDT") continue;
    const gasAmount = parseOptionalGasFeeAmount(item.gasFeeAmount);
    if (gasAmount == null) continue;
    expanded.push(buildGasFeeEntry(item.entry, gasAmount));
  }
  return expanded;
}
