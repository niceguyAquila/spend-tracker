import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth-api";
import { getBigBookVendorActorOutstandingDebtEntries } from "@/lib/db/queries";
import { bigBookVendorActorOutstandingDebtEntriesQuerySchema } from "@/lib/validation/big-book";

export async function GET(request: Request) {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = bigBookVendorActorOutstandingDebtEntriesQuerySchema.safeParse({
    actorId: searchParams.get("actorId") ?? "",
    currency: searchParams.get("currency") ?? "",
    groupId: searchParams.get("groupId") ?? "none",
    entryId: searchParams.get("entryId") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? ""
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await getBigBookVendorActorOutstandingDebtEntries({
      groupId: parsed.data.groupId === "none" ? null : parsed.data.groupId,
      entryId: parsed.data.entryId ?? null,
      actorId: parsed.data.actorId,
      currency: parsed.data.currency,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load outstanding debts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
