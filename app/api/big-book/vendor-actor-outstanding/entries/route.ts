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
    vendorTypeId: searchParams.get("vendorTypeId") ?? undefined,
    typeId: searchParams.get("typeId") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    creditKind: searchParams.get("creditKind") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const futureOnly = parsed.data.creditKind === "future";
    const result = await getBigBookVendorActorOutstandingEntries({
      vendorTypeId:
        futureOnly || parsed.data.vendorTypeId == null
          ? null
          : parsed.data.vendorTypeId === "none"
            ? null
            : parsed.data.vendorTypeId,
      typeId:
        !futureOnly || parsed.data.typeId == null
          ? null
          : parsed.data.typeId === "none"
            ? null
            : parsed.data.typeId,
      actorId: parsed.data.actorId,
      currency: parsed.data.currency,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      futureOnly
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load outstanding credits.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
