import type { BigBookCurrency } from "@/lib/big-book/totals";

export const BIG_BOOK_LEDGER_SORT_KEYS = [
  "entry_date",
  "entry_direction",
  "type_name",
  "sub_type_name",
  "vendor_type_name",
  "vendor_name",
  "explanation",
  "amount",
  "actor_display_name",
  "action_by_name",
  "pocket_name"
] as const;

export type BigBookLedgerSortKey = (typeof BIG_BOOK_LEDGER_SORT_KEYS)[number];
export type BigBookLedgerSortDir = "asc" | "desc";

export type LedgerScanRow = {
  id: string;
  group_id: string | null;
  entry_date: string;
  created_at: string;
  amount: number;
  currency_code: BigBookCurrency;
  entry_direction: "spending" | "profit";
  pocket_id?: string | null;
  is_credit?: boolean;
  explanation?: string | null;
  entry_type_id?: string | null;
  entry_sub_type_id?: string | null;
  vendor_type_id?: string | null;
  vendor_id?: string | null;
  action_by_id?: string | null;
  responsible_actor_id?: string | null;
};

export type LedgerNameLookups = {
  typeNameById?: Map<string, string>;
  subTypeNameById?: Map<string, string>;
  vendorTypeNameById?: Map<string, string>;
  vendorNameById?: Map<string, string>;
  actionByNameById?: Map<string, string>;
  pocketNameById?: Map<string, string>;
  actorNameById?: Map<string, string>;
};

export type LedgerDisplayKey =
  | {
      kind: "entry";
      id: string;
      sort_date: string;
      sort_created_at: string;
      sort_value: string | number | null;
      sort_currency: string;
    }
  | {
      kind: "group";
      id: string;
      sort_date: string;
      sort_created_at: string;
      sort_value: string | number | null;
      sort_currency: string;
    };

export type BuildLedgerDisplayKeysOptions = {
  sortBy?: BigBookLedgerSortKey;
  sortDir?: BigBookLedgerSortDir;
  lookups?: LedgerNameLookups;
};

const NAME_SORT_KEYS = new Set<BigBookLedgerSortKey>([
  "type_name",
  "sub_type_name",
  "vendor_type_name",
  "vendor_name",
  "actor_display_name",
  "action_by_name",
  "pocket_name"
]);

export function ledgerSortNeedsNameLookups(sortBy: BigBookLedgerSortKey): boolean {
  return NAME_SORT_KEYS.has(sortBy);
}

function lookupName(map: Map<string, string> | undefined, id: string | null | undefined): string | null {
  if (!id || !map) return null;
  return map.get(id) ?? null;
}

export function resolveLedgerSortValue(
  row: LedgerScanRow,
  sortBy: BigBookLedgerSortKey,
  lookups: LedgerNameLookups = {}
): string | number | null {
  switch (sortBy) {
    case "entry_date":
      return row.entry_date || null;
    case "entry_direction":
      return row.entry_direction || null;
    case "explanation": {
      const value = row.explanation?.trim() ?? "";
      return value.length ? value : null;
    }
    case "amount":
      return Number(row.amount);
    case "type_name": {
      const name = lookupName(lookups.typeNameById, row.entry_type_id);
      return name?.trim() ? name : null;
    }
    case "sub_type_name": {
      const name = lookupName(lookups.subTypeNameById, row.entry_sub_type_id);
      return name?.trim() ? name : null;
    }
    case "vendor_type_name": {
      const name = lookupName(lookups.vendorTypeNameById, row.vendor_type_id);
      return name?.trim() ? name : null;
    }
    case "vendor_name": {
      const name = lookupName(lookups.vendorNameById, row.vendor_id);
      return name?.trim() ? name : null;
    }
    case "actor_display_name": {
      const name = lookupName(lookups.actorNameById, row.responsible_actor_id);
      return name?.trim() ? name : null;
    }
    case "action_by_name": {
      const name = lookupName(lookups.actionByNameById, row.action_by_id);
      return name?.trim() ? name : null;
    }
    case "pocket_name": {
      const name = lookupName(lookups.pocketNameById, row.pocket_id);
      return name?.trim() ? name : null;
    }
    default:
      return null;
  }
}

function isEmptySortValue(value: string | number | null): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  return Number.isNaN(value);
}

/** Compare two sort values. Nulls/empties always sort last regardless of direction. */
export function compareLedgerSortValues(
  left: string | number | null,
  right: string | number | null,
  sortDir: BigBookLedgerSortDir
): number {
  const leftEmpty = isEmptySortValue(left);
  const rightEmpty = isEmptySortValue(right);
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  let cmp = 0;
  if (typeof left === "number" && typeof right === "number") {
    cmp = left === right ? 0 : left < right ? -1 : 1;
  } else {
    cmp = String(left).localeCompare(String(right), undefined, { sensitivity: "base" });
  }
  return sortDir === "asc" ? cmp : -cmp;
}

/**
 * Pick the member whose sort_value would appear first under the current key/direction.
 * For entry_date desc this is the newest member — matching the previous behaviour.
 */
function pickGroupWinningMember(
  members: LedgerScanRow[],
  sortBy: BigBookLedgerSortKey,
  sortDir: BigBookLedgerSortDir,
  lookups: LedgerNameLookups
): LedgerScanRow {
  let winner = members[0];
  let winnerValue = resolveLedgerSortValue(winner, sortBy, lookups);
  for (let i = 1; i < members.length; i += 1) {
    const candidate = members[i];
    const candidateValue = resolveLedgerSortValue(candidate, sortBy, lookups);
    const valueCmp = compareLedgerSortValues(candidateValue, winnerValue, sortDir);
    if (valueCmp < 0) {
      winner = candidate;
      winnerValue = candidateValue;
      continue;
    }
    if (valueCmp === 0) {
      // Prefer the member that would win the default date/created_at tiebreak under sortDir.
      const dateCmp = compareLedgerSortValues(candidate.entry_date, winner.entry_date, sortDir);
      if (dateCmp < 0) {
        winner = candidate;
        winnerValue = candidateValue;
        continue;
      }
      if (
        dateCmp === 0 &&
        compareLedgerSortValues(candidate.created_at, winner.created_at, sortDir) < 0
      ) {
        winner = candidate;
        winnerValue = candidateValue;
      }
    }
  }
  return winner;
}

export function buildLedgerDisplayKeys(
  scanRows: LedgerScanRow[],
  options: BuildLedgerDisplayKeysOptions = {}
): LedgerDisplayKey[] {
  const sortBy = options.sortBy ?? "entry_date";
  const sortDir = options.sortDir ?? "desc";
  const lookups = options.lookups ?? {};

  const groupMembers = new Map<string, LedgerScanRow[]>();
  const keys: LedgerDisplayKey[] = [];

  for (const row of scanRows) {
    if (row.group_id) {
      const list = groupMembers.get(row.group_id) ?? [];
      list.push(row);
      groupMembers.set(row.group_id, list);
      continue;
    }
    keys.push({
      kind: "entry",
      id: row.id,
      sort_date: row.entry_date,
      sort_created_at: row.created_at,
      sort_value: resolveLedgerSortValue(row, sortBy, lookups),
      sort_currency: row.currency_code
    });
  }

  for (const [groupId, members] of groupMembers) {
    const winner = pickGroupWinningMember(members, sortBy, sortDir, lookups);
    keys.push({
      kind: "group",
      id: groupId,
      sort_date: winner.entry_date,
      sort_created_at: winner.created_at,
      sort_value: resolveLedgerSortValue(winner, sortBy, lookups),
      sort_currency: winner.currency_code
    });
  }

  keys.sort((a, b) => {
    const valueCmp = compareLedgerSortValues(a.sort_value, b.sort_value, sortDir);
    if (valueCmp !== 0) return valueCmp;

    if (sortBy === "amount") {
      const currencyCmp = a.sort_currency.localeCompare(b.sort_currency);
      if (currencyCmp !== 0) return currencyCmp;
    }

    // Stable tiebreakers: always newest-first on date/created_at so paging is deterministic
    // regardless of the active sort direction.
    if (a.sort_date !== b.sort_date) return a.sort_date < b.sort_date ? 1 : -1;
    if (a.sort_created_at !== b.sort_created_at) return a.sort_created_at < b.sort_created_at ? 1 : -1;
    return a.id.localeCompare(b.id);
  });

  return keys;
}
