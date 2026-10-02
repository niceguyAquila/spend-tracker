import { describe, expect, it } from "vitest";
import { parentCheckState } from "@/lib/big-book/outstanding-parent-check-state";

describe("outstanding parent checkbox state", () => {
  it("is unchecked when no details and row not selected", () => {
    expect(parentCheckState(null, new Set(), false)).toBe("unchecked");
  });

  it("is checked when no details and row is selected", () => {
    expect(parentCheckState(null, new Set(), true)).toBe("checked");
  });

  it("is checked when all children are selected", () => {
    expect(parentCheckState(["a", "b"], new Set(["a", "b"]), false)).toBe("checked");
  });

  it("is unchecked when no children are selected", () => {
    expect(parentCheckState(["a", "b"], new Set(), true)).toBe("unchecked");
  });

  it("is indeterminate when some children are selected", () => {
    expect(parentCheckState(["a", "b", "c"], new Set(["b"]), false)).toBe("indeterminate");
  });
});
