// Helpers shared by the admin reference-table routes (types, sub-types, vendor
// types, vendors, pockets) so failures come back as sentences an admin can act
// on instead of raw Postgres text.

export type LabeledRow = {
  code?: string | null;
  name?: string | null;
  is_active?: boolean | null;
  sort_order?: number | null;
};

type WriteErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
} | null;

const SORT_ORDER_STEP = 10;

export function nextSortOrder(rows: LabeledRow[] | null | undefined): number {
  const highest = (rows ?? []).reduce((max, row) => {
    return typeof row.sort_order === "number" && row.sort_order > max ? row.sort_order : max;
  }, Number.NEGATIVE_INFINITY);
  return highest === Number.NEGATIVE_INFINITY ? SORT_ORDER_STEP : highest + SORT_ORDER_STEP;
}

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function conflictMessage(entityLabel: string, field: "code" | "name", value: string, row: LabeledRow) {
  const owner = (row.name ?? "").trim();
  const ownerSuffix = owner ? ` ("${owner}")` : "";
  if (row.is_active === false) {
    return `An inactive ${entityLabel}${ownerSuffix} already uses the ${field} "${value}". Activate that one instead of adding a new one.`;
  }
  return `Another ${entityLabel}${ownerSuffix} already uses the ${field} "${value}".`;
}

// Mirrors the unique indexes on these tables, which compare lower(trim(...)).
export function findLabelConflict(
  rows: LabeledRow[] | null | undefined,
  candidate: { code: string; name: string },
  entityLabel: string
): string | null {
  const code = normalizeLabel(candidate.code);
  const name = normalizeLabel(candidate.name);

  for (const row of rows ?? []) {
    if (code && normalizeLabel(row.code) === code) {
      return conflictMessage(entityLabel, "code", candidate.code.trim(), row);
    }
    if (name && normalizeLabel(row.name) === name) {
      return conflictMessage(entityLabel, "name", candidate.name.trim(), row);
    }
  }

  return null;
}

export function describeWriteError(error: WriteErrorLike, entityLabel: string): string {
  if (!error) {
    return `Failed to save the ${entityLabel}.`;
  }

  const haystack = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

  if (error.code === "23505") {
    if (haystack.includes("_code")) {
      return `Another ${entityLabel} already uses this code.`;
    }
    if (haystack.includes("_name")) {
      return `Another ${entityLabel} already uses this name.`;
    }
    return `This ${entityLabel} already exists.`;
  }

  if (error.code === "23503") {
    return `This ${entityLabel} points to a record that no longer exists. Refresh the page and try again.`;
  }

  if (error.code === "23514") {
    return `The ${entityLabel} code and name must each be at least 2 characters.`;
  }

  if (error.code === "42501" || haystack.includes("row-level security")) {
    return `You do not have permission to change ${entityLabel} records.`;
  }

  return error.message ?? `Failed to save the ${entityLabel}.`;
}
