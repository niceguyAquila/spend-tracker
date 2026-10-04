import type { BigBookEntry } from "@/lib/types";

export type LedgerGroupTone = "normal" | "credit" | "debt";

/**
 * Visual tone for a ledger group block.
 * Debt wins over credit when both appear; otherwise normal (magenta).
 */
export function classifyLedgerGroupTone(
  entries: Array<Pick<BigBookEntry, "is_credit" | "is_debt">>
): LedgerGroupTone {
  let hasCredit = false;
  for (const entry of entries) {
    if (entry.is_debt) return "debt";
    if (entry.is_credit) hasCredit = true;
  }
  return hasCredit ? "credit" : "normal";
}

export function ledgerGroupToneClass(tone: LedgerGroupTone): string {
  if (tone === "credit") return "group-tone-credit";
  if (tone === "debt") return "group-tone-debt";
  return "";
}
