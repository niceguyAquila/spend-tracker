import { describe, expect, it } from "vitest";
import {
  escapeCsvCell,
  escapeCsvCellSpreadsheetSafe,
  flattenCsvNewlines
} from "@/lib/csv/primitives";

describe("flattenCsvNewlines", () => {
  it("replaces CR, LF, and CRLF with spaces", () => {
    expect(flattenCsvNewlines("a\nb\rc\r\nd")).toBe("a b c d");
  });
});

describe("escapeCsvCellSpreadsheetSafe", () => {
  it("flattens embedded newlines so one logical row stays one spreadsheet row", () => {
    const remark = "kilo = u398,300\nX = u144,200\n(total = 542500)";
    const cell = escapeCsvCellSpreadsheetSafe(remark);

    expect(cell).not.toMatch(/\n|\r/);
    expect(cell).toBe('"kilo = u398,300 X = u144,200 (total = 542500)"');
  });

  it("still quotes commas and doubles embedded quotes", () => {
    expect(escapeCsvCellSpreadsheetSafe('say "hi", please')).toBe('"say ""hi"", please"');
  });

  it("leaves plain values unquoted", () => {
    expect(escapeCsvCellSpreadsheetSafe("Actor A")).toBe("Actor A");
  });

  it("differs from RFC escape by not preserving newlines inside quotes", () => {
    const withNewline = "line1\nline2";
    expect(escapeCsvCell(withNewline)).toBe('"line1\nline2"');
    expect(escapeCsvCellSpreadsheetSafe(withNewline)).toBe("line1 line2");
  });
});
