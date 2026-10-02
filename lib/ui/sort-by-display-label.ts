/**
 * Case-insensitive A–Z compare for dropdown display labels.
 */
export function compareDisplayLabels(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/**
 * Return a new array sorted by display label (ascending, case-insensitive).
 */
export function sortByDisplayLabel<T>(items: readonly T[], getLabel: (item: T) => string): T[] {
  return [...items].sort((a, b) => compareDisplayLabels(getLabel(a), getLabel(b)));
}

export type LabeledOption = {
  value: string;
  label: string;
};

/**
 * True for empty / All / Select… / (none) / Unassigned style options that should
 * stay pinned above alphabetically sorted items.
 */
export function isPlaceholderSelectOption(option: LabeledOption): boolean {
  if (option.value === "") return true;
  const label = option.label.trim().toLowerCase();
  if (!label) return true;
  if (label === "all" || label.startsWith("all ")) return true;
  if (label === "(none)" || label === "none") return true;
  if (label === "unassigned") return true;
  if (label.startsWith("select")) return true;
  return false;
}

/**
 * Sort labeled options A–Z by label, keeping placeholder / empty / All options first
 * (stable relative order among placeholders).
 */
export function sortSelectOptions<T extends LabeledOption>(options: readonly T[]): T[] {
  const placeholders: T[] = [];
  const rest: T[] = [];
  for (const option of options) {
    if (isPlaceholderSelectOption(option)) placeholders.push(option);
    else rest.push(option);
  }
  rest.sort((a, b) => compareDisplayLabels(a.label, b.label));
  return [...placeholders, ...rest];
}
