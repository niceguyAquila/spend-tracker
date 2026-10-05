export type ParentCheckState = "checked" | "unchecked" | "indeterminate";

/**
 * Tri-state for an outstanding vendor-row checkbox given its loaded child credit ids.
 * When details are not loaded yet (`detailIds === null`), fall back to the row flag.
 */
export function parentCheckState(
  detailIds: string[] | null,
  selectedCreditIds: Set<string>,
  rowSelected: boolean
): ParentCheckState {
  if (!detailIds) {
    return rowSelected ? "checked" : "unchecked";
  }
  if (!detailIds.length) {
    return rowSelected ? "checked" : "unchecked";
  }
  let selectedCount = 0;
  for (const id of detailIds) {
    if (selectedCreditIds.has(id)) selectedCount += 1;
  }
  if (selectedCount === 0) return "unchecked";
  if (selectedCount === detailIds.length) return "checked";
  return "indeterminate";
}
