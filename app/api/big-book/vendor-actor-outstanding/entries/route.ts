import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth-api";
import { getBigBookVendorActorOutstandingEntries } from "@/lib/db/queries";
import { bigBookVendorActorOutstandingEntriesQuerySchema } from "@/lib/validation/big-book";

export async function GET(request: Request) {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = bigBookVendorActorOutstandingEntriesQuerySchema.safeParse({
    actorId: searchParams.get("actorId") ?? "",
    currency: searchParams.get("currency") ?? "",
    vendorId: searchParams.get("vendorId") ?? "none",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? ""
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await getBigBookVendorActorOutstandingEntries({
      vendorId: parsed.data.vendorId === "none" ? null : parsed.data.vendorId,
      actorId: parsed.data.actorId,
      currency: parsed.data.currency,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load outstanding credits.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
