export type GroupStatusBadgeKind =
  | "open_debt"
  | "open_future_credit"
  | "open_credit"
  | "settled";

export type GroupStatusMember = {
  is_debt?: boolean;
  is_credit?: boolean;
  is_future_credit?: boolean;
  credit_status?: "open" | "settled" | null;
  debt_status?: "open" | "settled" | null;
  settles_entry_id?: string | null;
};

function isOpenDebt(entry: GroupStatusMember) {
  return Boolean(entry.is_debt) && (entry.debt_status ?? "open") !== "settled";
}

function isOpenFutureCredit(entry: GroupStatusMember) {
  return (
    Boolean(entry.is_future_credit) && (entry.credit_status ?? "open") !== "settled"
  );
}

function isOpenCredit(entry: GroupStatusMember) {
  return (
    Boolean(entry.is_credit) &&
    !entry.is_future_credit &&
    (entry.credit_status ?? "open") !== "settled"
  );
}

function isObligation(entry: GroupStatusMember) {
  return Boolean(entry.is_debt || entry.is_credit);
}

/**
 * Derived Credit-column badge for a ledger group header.
 * Precedence: Open Debt → Open Future Credit → Open Credit → Settled
 * (all obligations settled, or only settlement rows remain).
 */
export function deriveGroupStatusBadge(
  members: GroupStatusMember[]
): GroupStatusBadgeKind | null {
  if (members.some(isOpenDebt)) return "open_debt";
  if (members.some(isOpenFutureCredit)) return "open_future_credit";
  if (members.some(isOpenCredit)) return "open_credit";

  const hasObligation = members.some(isObligation);
  const hasSettlement = members.some((entry) => Boolean(entry.settles_entry_id));
  if (hasObligation || hasSettlement) return "settled";

  return null;
}

export const GROUP_STATUS_BADGE_LABELS: Record<GroupStatusBadgeKind, string> = {
  open_debt: "Open debt",
  open_future_credit: "Future Credit",
  open_credit: "Open",
  settled: "Settled"
};

/** Match child-row badge colors in `big-book-entry-row.tsx`. */
export function groupStatusBadgeClass(kind: GroupStatusBadgeKind): string {
  switch (kind) {
    case "open_debt":
      return "bg-[rgb(var(--danger)/0.15)] text-[rgb(var(--danger))]";
    case "open_future_credit":
      return "bg-[rgb(var(--warning)/0.18)] text-[rgb(var(--warning))]";
    case "open_credit":
      return "bg-[rgb(var(--warning)/0.15)] text-[rgb(var(--warning))]";
    case "settled":
      return "bg-[rgb(var(--success)/0.15)] text-[rgb(var(--success))]";
  }
}
