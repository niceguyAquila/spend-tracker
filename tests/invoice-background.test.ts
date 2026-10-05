import { describe, expect, it } from "vitest";
import { lightenInvoiceBackgroundHex } from "@/lib/big-book/invoice-background";

describe("lightenInvoiceBackgroundHex", () => {
  it("mixes color toward white", () => {
    expect(lightenInvoiceBackgroundHex("#000000", 0.9)).toBe("#E6E6E6");
    expect(lightenInvoiceBackgroundHex("#336699", 0.88)).toBe("#E7EDF3");
  });

  it("returns white for invalid input", () => {
    expect(lightenInvoiceBackgroundHex("not-a-color")).toBe("#FFFFFF");
  });
});
