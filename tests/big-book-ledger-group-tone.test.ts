import { describe, expect, it } from "vitest";
import {
  classifyLedgerGroupTone,
  ledgerGroupToneClass
} from "@/lib/big-book/ledger-group-tone";

describe("classifyLedgerGroupTone", () => {
  it("returns normal when no credit or debt marks", () => {
    expect(
      classifyLedgerGroupTone([
        { is_credit: false, is_debt: false },
        { is_credit: false, is_debt: false }
      ])
    ).toBe("normal");
  });

  it("returns credit when any entry is credit and none are debt", () => {
    expect(
      classifyLedgerGroupTone([
        { is_credit: true, is_debt: false },
        { is_credit: false, is_debt: false }
      ])
    ).toBe("credit");
  });

  it("returns debt when any entry is debt", () => {
    expect(
      classifyLedgerGroupTone([
        { is_credit: false, is_debt: true },
        { is_credit: false, is_debt: false }
      ])
    ).toBe("debt");
  });

  it("prefers debt when both credit and debt appear", () => {
    expect(
      classifyLedgerGroupTone([
        { is_credit: true, is_debt: false },
        { is_credit: false, is_debt: true }
      ])
    ).toBe("debt");
  });
});

describe("ledgerGroupToneClass", () => {
  it("maps tones to CSS modifier classes", () => {
    expect(ledgerGroupToneClass("normal")).toBe("");
    expect(ledgerGroupToneClass("credit")).toBe("group-tone-credit");
    expect(ledgerGroupToneClass("debt")).toBe("group-tone-debt");
  });
});
