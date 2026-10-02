import { describe, expect, it } from "vitest";
import {
  compareDisplayLabels,
  isPlaceholderSelectOption,
  sortByDisplayLabel,
  sortSelectOptions
} from "@/lib/ui/sort-by-display-label";

describe("compareDisplayLabels", () => {
  it("sorts case-insensitively", () => {
    expect(compareDisplayLabels("apple", "Banana")).toBeLessThan(0);
    expect(compareDisplayLabels("zebra", "Apple")).toBeGreaterThan(0);
  });
});

describe("sortByDisplayLabel", () => {
  it("sorts by extracted label", () => {
    const rows = [{ name: "zeta" }, { name: "Alpha" }, { name: "beta" }];
    expect(sortByDisplayLabel(rows, (row) => row.name).map((row) => row.name)).toEqual([
      "Alpha",
      "beta",
      "zeta"
    ]);
  });
});

describe("sortSelectOptions", () => {
  it("keeps placeholders first, then A–Z items", () => {
    const options = [
      { value: "b", label: "Bravo" },
      { value: "", label: "(none)" },
      { value: "a", label: "alpha" },
      { value: "all", label: "All" },
      { value: "c", label: "Charlie" }
    ];
    expect(sortSelectOptions(options)).toEqual([
      { value: "", label: "(none)" },
      { value: "all", label: "All" },
      { value: "a", label: "alpha" },
      { value: "b", label: "Bravo" },
      { value: "c", label: "Charlie" }
    ]);
  });

  it("treats Select… labels as placeholders", () => {
    expect(isPlaceholderSelectOption({ value: "x", label: "Select group…" })).toBe(true);
    expect(isPlaceholderSelectOption({ value: "x", label: "Vendor A" })).toBe(false);
  });
});
