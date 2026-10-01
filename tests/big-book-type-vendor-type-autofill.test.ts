import { describe, expect, it } from "vitest";
import { mappedVendorTypeIdForType } from "@/lib/big-book/type-vendor-type-map";
import type { BigBookTypeVendorTypeMap } from "@/lib/types";

const maps: BigBookTypeVendorTypeMap[] = [
  {
    id: "map-1",
    entry_type_id: "type-op",
    vendor_type_id: "vt-merchant",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z"
  }
];

describe("type → vendor type mapping helper", () => {
  it("resolves mapped vendor type id for a type", () => {
    expect(mappedVendorTypeIdForType("type-op", maps)).toBe("vt-merchant");
    expect(mappedVendorTypeIdForType("type-other", maps)).toBe("");
    expect(mappedVendorTypeIdForType("type-op", [])).toBe("");
    expect(mappedVendorTypeIdForType("", maps)).toBe("");
  });

  it("maps are used to seed create-form vendor_type_id (same helper as createEmptyEntryForm)", () => {
    const defaultTypeId = "type-op";
    const vendorTypeId = mappedVendorTypeIdForType(defaultTypeId, maps);
    expect(vendorTypeId).toBe("vt-merchant");
    expect(mappedVendorTypeIdForType("type-other", maps)).toBe("");
  });
});
