import { NextResponse } from "next/server";

export const OPTIMISTIC_CONFLICT_MESSAGE =
  "This record was changed by someone else. Refresh and try again.";

export const OPTIMISTIC_MISSING_TIMESTAMP_MESSAGE =
  "expected_updated_at is required to update or delete this record.";

type MaybeRow = { id?: string; updated_at?: string } | null;

/**
 * After an update/delete gated by id + updated_at returns no row, distinguish
 * "gone" (404) from "stale client copy" (409).
 */
export async function resolveOptimisticMiss(options: {
  existing: MaybeRow;
  missingMessage?: string;
}): Promise<NextResponse> {
  if (!options.existing?.id) {
    return NextResponse.json(
      { error: options.missingMessage ?? "Entry not found." },
      { status: 404 }
    );
  }
  return NextResponse.json(
    {
      error: OPTIMISTIC_CONFLICT_MESSAGE,
      code: "optimistic_conflict",
      current_updated_at: options.existing.updated_at ?? null
    },
    { status: 409 }
  );
}

export function parseExpectedUpdatedAt(
  value: string | null | undefined
): { ok: true; value: string } | { ok: false; response: NextResponse } {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return {
      ok: false,
      response: NextResponse.json({ error: OPTIMISTIC_MISSING_TIMESTAMP_MESSAGE }, { status: 400 })
    };
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "expected_updated_at must be a valid ISO timestamp." },
        { status: 400 }
      )
    };
  }
  return { ok: true, value: trimmed };
}
