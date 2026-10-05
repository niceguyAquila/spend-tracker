import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth-api";
import { getBigBookEntryAuditLogs } from "@/lib/db/queries";

const auditQuerySchema = z.object({
  entry_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export async function GET(request: Request) {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = auditQuerySchema.safeParse({
    entry_id: searchParams.get("entry_id") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await getBigBookEntryAuditLogs({
      entryId: parsed.data.entry_id,
      limit: parsed.data.limit,
      offset: parsed.data.offset
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load audit history.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
