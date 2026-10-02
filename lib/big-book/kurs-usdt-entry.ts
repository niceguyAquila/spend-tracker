import {
  buildGasFeeEntry,
  parseOptionalGasFeeAmount,
  type BigBookGasFeeEntryPayload,
  type GasFeeSourceEntry
} from "@/lib/big-book/gas-fee-entry";

export const KURS_TYPE_NAME = "KURS";
export const KURS_EXPLANATION_MAX = 500;
export const KURS_CURRENCY = "USDT" as const;
/** Amount inputs allow 4 decimal places; keep companion amounts aligned. */
export const KURS_AMOUNT_DECIMALS = 4;

export const KURS_TYPE_MISSING_ERROR =
  'KURS ledger type not found. Create an active type named "KURS" in Big Book Settings.';

export type KursSourceEntry = GasFeeSourceEntry & {
  amount: number;
  currency_code: string;
  entry_direction: "spending" | "profit";
};

export type BigBookKursEntryPayload = {
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
  currency_code: typeof KURS_CURRENCY;
  remark: string;
  responsible_actor_id: string;
};

export type KursTypeRow = {
  id: string;
  name: string;
  is_active?: boolean | null;
};

/** Empty or non-finite values mean "skip the companion row". */
export function parseOptionalKursRate(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const raw = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(raw)) return null;
  return raw;
}

/** Empty, invalid, or non-positive amounts mean "skip the companion row". */
export function parseOptionalKursAmount(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const raw = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw;
}

export function roundKursAmount(amount: number): number {
  const factor = 10 ** KURS_AMOUNT_DECIMALS;
  return Math.round(amount * factor) / factor;
}

/**
 * Companion USDT amount = A × (1 − r).
 * Returns null when inputs are invalid or the result is not positive.
 */
export function calculateKursAmount(mainAmount: number, rate: number): number | null {
  if (!Number.isFinite(mainAmount) || mainAmount <= 0) return null;
  if (!Number.isFinite(rate)) return null;
  const amount = roundKursAmount(mainAmount * (1 - rate));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

/**
 * Prefer an explicit override amount; otherwise compute from rate.
 * Skip when currency/direction are wrong, or the resulting amount is empty/non-positive.
 */
export function resolveKursCompanionAmount(options: {
  currencyCode: string;
  entryDirection: "spending" | "profit";
  mainAmount: number;
  kursRate?: string | number | null;
  kursAmount?: string | number | null;
}): number | null {
  if (options.currencyCode !== "USDT" || options.entryDirection !== "profit") return null;

  const override = parseOptionalKursAmount(options.kursAmount);
  if (override != null) return override;

  const rate = parseOptionalKursRate(options.kursRate);
  if (rate == null) return null;
  return calculateKursAmount(options.mainAmount, rate);
}

export function willCreateKursEntry(options: {
  currencyCode: string;
  entryDirection: "spending" | "profit";
  mainAmount: number | string;
  kursRate?: string | number | null;
  kursAmount?: string | number | null;
}) {
  const mainAmount =
    typeof options.mainAmount === "number"
      ? options.mainAmount
      : Number(String(options.mainAmount).replace(/,/g, "").trim());
  return (
    resolveKursCompanionAmount({
      currencyCode: options.currencyCode,
      entryDirection: options.entryDirection,
      mainAmount,
      kursRate: options.kursRate,
      kursAmount: options.kursAmount
    }) != null
  );
}

export function buildKursExplanation(mainExplanation: string) {
  const combined = `KURS — ${mainExplanation.trim()}`;
  if (combined.length <= KURS_EXPLANATION_MAX) return combined;
  return combined.slice(0, KURS_EXPLANATION_MAX);
}

export function buildKursEntry(
  main: KursSourceEntry,
  kursTypeId: string,
  kursAmount: number
): BigBookKursEntryPayload {
  return {
    entry_date: main.entry_date,
    entry_direction: "spending",
    entry_type_id: kursTypeId,
    entry_sub_type_id: main.entry_sub_type_id ?? null,
    vendor_type_id: main.vendor_type_id ?? null,
    vendor_id: main.vendor_id ?? null,
    pocket_id: null,
    action_by_id: main.action_by_id ?? null,
    explanation: buildKursExplanation(main.explanation),
    amount: kursAmount,
    currency_code: KURS_CURRENCY,
    remark: "",
    responsible_actor_id: main.responsible_actor_id
  };
}

/** Case-insensitive match on type name "KURS"; prefer an active row when several match. */
export function findKursTypeId(types: KursTypeRow[]): string | null {
  const matches = types.filter((row) => row.name.trim().toLowerCase() === KURS_TYPE_NAME.toLowerCase());
  if (!matches.length) return null;
  const active = matches.find((row) => row.is_active !== false);
  return (active ?? matches[0]).id;
}

export function expandGroupPayloadsWithKursAndGasFees<
  T extends KursSourceEntry & { amount: number; currency_code: string }
>(
  items: Array<{
    entry: T;
    gasFeeAmount?: string | number | null;
    kursRate?: string | number | null;
    kursAmount?: string | number | null;
  }>,
  kursTypeId: string | null
): Array<T | BigBookKursEntryPayload | BigBookGasFeeEntryPayload> {
  const expanded: Array<T | BigBookKursEntryPayload | BigBookGasFeeEntryPayload> = [];
  for (const item of items) {
    expanded.push(item.entry);

    const kursAmount = resolveKursCompanionAmount({
      currencyCode: item.entry.currency_code,
      entryDirection: item.entry.entry_direction,
      mainAmount: item.entry.amount,
      kursRate: item.kursRate,
      kursAmount: item.kursAmount
    });
    if (kursAmount != null) {
      if (!kursTypeId) {
        throw new Error(KURS_TYPE_MISSING_ERROR);
      }
      expanded.push(buildKursEntry(item.entry, kursTypeId, kursAmount));
    }

    if (item.entry.currency_code === "USDT") {
      const gasAmount = parseOptionalGasFeeAmount(item.gasFeeAmount);
      if (gasAmount != null) {
        expanded.push(buildGasFeeEntry(item.entry, gasAmount));
      }
    }
  }
  return expanded;
}
