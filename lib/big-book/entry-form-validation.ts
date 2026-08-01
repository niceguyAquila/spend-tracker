export type EntryRequiredFields = {
  explanation: string;
  amount: string;
};

export type MissingEntryField = "explanation" | "amount";

/** Returns which required entry fields are empty. Structural — not tied to either EntryFormState. */
export function missingEntryFields(fields: EntryRequiredFields): MissingEntryField[] {
  const missing: MissingEntryField[] = [];
  if (!fields.explanation.trim()) missing.push("explanation");
  if (!fields.amount.trim()) missing.push("amount");
  return missing;
}

/** Human-readable hint for what's blocking Save. */
export function describeMissingFields(missing: MissingEntryField[]): string | null {
  if (missing.length === 0) return null;
  if (missing.length === 2) return "Add an explanation and amount to save.";
  if (missing[0] === "explanation") return "Add an explanation to save.";
  return "Add an amount to save.";
}

/**
 * Describe missing fields across multiple transactions (grouped mode).
 * Returns null when every transaction is valid.
 */
export function describeGroupedMissingFields(
  forms: EntryRequiredFields[],
  options?: { groupLabel?: string; minLabelLength?: number; minEntries?: number }
): string | null {
  const minLabelLength = options?.minLabelLength ?? 2;
  const minEntries = options?.minEntries ?? 2;
  const label = options?.groupLabel?.trim() ?? "";

  if (label.length < minLabelLength) {
    return `Add a group label (at least ${minLabelLength} characters) to save.`;
  }
  if (forms.length < minEntries) {
    return `Add at least ${minEntries} transactions to save.`;
  }

  for (let i = 0; i < forms.length; i += 1) {
    const missing = missingEntryFields(forms[i]);
    if (missing.length === 0) continue;
    const n = i + 1;
    if (missing.length === 2) return `Transaction ${n} is missing an explanation and amount.`;
    if (missing[0] === "explanation") return `Transaction ${n} is missing an explanation.`;
    return `Transaction ${n} is missing an amount.`;
  }

  return null;
}
