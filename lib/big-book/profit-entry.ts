export const PROFIT_TYPE_NAME = "PROFIT";
export const PROFIT_EXPLANATION_MAX = 500;

export const PROFIT_TYPE_MISSING_ERROR =
  'PROFIT ledger type not found. Create an active type named "PROFIT" in Big Book Settings.';

export type ProfitTypeRow = {
  id: string;
  name: string;
  is_active?: boolean | null;
};

export type ProfitSourceEntry = {
  entry_date: string;
  entry_sub_type_id?: string | null;
  vendor_type_id?: string | null;
  vendor_id?: string | null;
  action_by_id?: string | null;
  explanation: string;
  responsible_actor_id: string;
};

export type BigBookProfitEntryPayload = {
  entry_date: string;
  entry_direction: "profit";
  entry_type_id: string;
  entry_sub_type_id: string | null;
  vendor_type_id: string | null;
  vendor_id: string | null;
  pocket_id: null;
  action_by_id: string | null;
  explanation: string;
  amount: number;
  currency_code: string;
  remark: string;
  responsible_actor_id: string;
};

/** Empty, invalid, or non-positive amounts mean "skip the companion row". */
export function parseOptionalProfitAmount(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const raw = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw;
}

export function buildProfitExplanation(mainExplanation: string) {
  const combined = `PROFIT — ${mainExplanation.trim()}`;
  if (combined.length <= PROFIT_EXPLANATION_MAX) return combined;
  return combined.slice(0, PROFIT_EXPLANATION_MAX);
}

export function buildProfitEntry(
  main: ProfitSourceEntry,
  profitTypeId: string,
  profitAmount: number,
  currencyCode: string
): BigBookProfitEntryPayload {
  return {
    entry_date: main.entry_date,
    entry_direction: "profit",
    entry_type_id: profitTypeId,
    entry_sub_type_id: main.entry_sub_type_id ?? null,
    vendor_type_id: main.vendor_type_id ?? null,
    vendor_id: main.vendor_id ?? null,
    pocket_id: null,
    action_by_id: main.action_by_id ?? null,
    explanation: buildProfitExplanation(main.explanation),
    amount: profitAmount,
    currency_code: currencyCode,
    remark: "",
    responsible_actor_id: main.responsible_actor_id
  };
}

/** Case-insensitive match on type name "PROFIT"; prefer an active row when several match. */
export function findProfitTypeId(types: ProfitTypeRow[]): string | null {
  const matches = types.filter(
    (row) => row.name.trim().toLowerCase() === PROFIT_TYPE_NAME.toLowerCase()
  );
  if (!matches.length) return null;
  const active = matches.find((row) => row.is_active !== false);
  return (active ?? matches[0]).id;
}
