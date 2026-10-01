import type { BigBookTypeVendorTypeMap } from "@/lib/types";

/** Resolve the mapped Vendor Type id for a ledger Type, or "" when unmapped. */
export function mappedVendorTypeIdForType(
  entryTypeId: string,
  maps: BigBookTypeVendorTypeMap[] | undefined
): string {
  if (!entryTypeId || !maps?.length) return "";
  return maps.find((row) => row.entry_type_id === entryTypeId)?.vendor_type_id ?? "";
}
