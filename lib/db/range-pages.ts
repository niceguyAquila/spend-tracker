/** PostgREST / Supabase default max-rows per request. */
export const POSTGREST_MAX_ROWS = 1000;

/**
 * Fetch rows via inclusive range windows until exhausted or `maxRows` is hit.
 * Keeps each request at or below PostgREST's max-rows so `.limit(N)` alone
 * cannot silently truncate large result sets.
 */
export async function collectRangePages<T>(
  fetchPage: (from: number, to: number) => Promise<readonly T[]>,
  options: { maxRows: number; pageSize?: number }
): Promise<T[]> {
  const maxRows = Math.max(0, Math.floor(options.maxRows));
  if (maxRows === 0) return [];

  const pageSize = Math.min(
    Math.max(1, Math.floor(options.pageSize ?? POSTGREST_MAX_ROWS)),
    POSTGREST_MAX_ROWS,
    maxRows
  );

  const rows: T[] = [];
  let offset = 0;

  while (rows.length < maxRows) {
    const take = Math.min(pageSize, maxRows - rows.length);
    const batch = await fetchPage(offset, offset + take - 1);
    rows.push(...batch);
    if (batch.length < take) break;
    offset += batch.length;
  }

  return rows;
}
