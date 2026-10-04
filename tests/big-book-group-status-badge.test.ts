import { describe, expect, it } from "vitest";
import {
  deriveGroupStatusBadge,
  GROUP_STATUS_BADGE_LABELS,
  type GroupStatusMember
} from "@/lib/big-book/group-status-badge";

function member(flags: GroupStatusMember): GroupStatusMember {
  return flags;
}

describe("deriveGroupStatusBadge", () => {
  it("returns null for ordinary groups with no credit/debt/settlement", () => {
    expect(deriveGroupStatusBadge([member({}), member({})])).toBeNull();
  });

  it("prefers Open debt over other statuses", () => {
    expect(
      deriveGroupStatusBadge([
        member({ is_debt: true, debt_status: "open" }),
        member({ is_credit: true, credit_status: "open" }),
        member({ settles_entry_id: "x" })
      ])
    ).toBe("open_debt");
  });

  it("prefers open Future Credit over open Credit and Settled", () => {
    expect(
      deriveGroupStatusBadge([
        member({ is_future_credit: true, is_credit: true, credit_status: "open" }),
        member({ is_credit: true, credit_status: "open" }),
        member({ is_credit: true, credit_status: "settled" })
      ])
    ).toBe("open_future_credit");
  });

  it("shows Open for open actualized credit groups", () => {
    expect(
      deriveGroupStatusBadge([
        member({ is_credit: true, credit_status: "open" }),
        member({ is_credit: true, credit_status: "settled" })
      ])
    ).toBe("open_credit");
  });

  it("shows Settled when all debt obligations are settled", () => {
    expect(
      deriveGroupStatusBadge([
        member({ is_debt: true, debt_status: "settled" }),
        member({ is_debt: true, debt_status: "settled" }),
        member({ settles_entry_id: "pay-1" })
      ])
    ).toBe("settled");
  });

  it("shows Settled when all credit obligations are settled", () => {
    expect(
      deriveGroupStatusBadge([
        member({ is_credit: true, credit_status: "settled" }),
        member({ is_future_credit: true, is_credit: true, credit_status: "settled" }),
        member({ settles_entry_id: "settle-1" })
      ])
    ).toBe("settled");
  });

  it("shows Settled when only settlement rows remain", () => {
    expect(
      deriveGroupStatusBadge([
        member({ settles_entry_id: "a" }),
        member({ settles_entry_id: "b" })
      ])
    ).toBe("settled");
  });

  it("treats missing status as open for debt and credit", () => {
    expect(deriveGroupStatusBadge([member({ is_debt: true })])).toBe("open_debt");
    expect(deriveGroupStatusBadge([member({ is_credit: true })])).toBe("open_credit");
    expect(
      deriveGroupStatusBadge([member({ is_credit: true, is_future_credit: true })])
    ).toBe("open_future_credit");
  });

  it("exposes labels that match child-row badge copy", () => {
    expect(GROUP_STATUS_BADGE_LABELS.open_debt).toBe("Open debt");
    expect(GROUP_STATUS_BADGE_LABELS.open_future_credit).toBe("Future Credit");
    expect(GROUP_STATUS_BADGE_LABELS.open_credit).toBe("Open");
    expect(GROUP_STATUS_BADGE_LABELS.settled).toBe("Settled");
  });
});
