// Shared rules for the short uppercase codes used by the reference tables
// (types, sub-types, vendor types, vendors, pockets). Kept free of server and
// validation dependencies so the settings forms can import it directly.

export const ENTITY_CODE_MAX_LENGTH = 64;
export const ENTITY_CODE_PATTERN = /^[A-Z0-9_]+$/;
export const ENTITY_CODE_HINT = "Uppercase letters, numbers, and underscores only. Example: OFFICE_RENT";
export const ENTITY_CODE_RULE = "uppercase letters, numbers, and underscores only (example: OFFICE_RENT).";

// Applied while the admin types so a value the API would reject can never be
// submitted: spaces and punctuation become underscores. Leading whitespace is
// dropped instead of converted so pasted values stay clean.
export function normalizeEntityCode(value: string): string {
  return value
    .replace(/^\s+/, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .slice(0, ENTITY_CODE_MAX_LENGTH);
}
