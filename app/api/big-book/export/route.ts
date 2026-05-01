import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth-api";
import { bigBookEntriesQuerySchema } from "@/lib/validation/big-book";
import { getBigBookEntries } from "@/lib/db/queries";

const EXPORT_HEADERS = [
  "entry_date",
  "entry_direction",
  "type_name",
  "sub_type_name",
  "explanation",
  "amount",
  "currency_code",
  "remark",
  "actor_name"
] as const;

function escapeCsvCell(value: string | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (str.length === 0) return "";
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatAmountForCsv(amount: number): string {
  if (!Number.isFinite(amount)) return "0";
  const fixed = Number(amount).toFixed(4);
  return fixed.replace(/\.?0+$/, "");
}

export async function GET(request: Request) {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = bigBookEntriesQuerySchema.safeParse({
    typeId: searchParams.getAll("typeId"),
    currencyCode: searchParams.getAll("currencyCode"),
    direction: searchParams.getAll("direction"),
    actorId: searchParams.getAll("actorId"),
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    query: searchParams.get("query") ?? "",
    page: 0,
    pageSize: 1
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const entries = await getBigBookEntries({
      typeId: parsed.data.typeId,
      currencyCode: parsed.data.currencyCode,
      direction: parsed.data.direction,
      actorId: parsed.data.actorId,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      query: parsed.data.query,
      limit: 100000
    });

    const lines: string[] = [];
    lines.push(EXPORT_HEADERS.join(","));
    for (const entry of entries) {
      const cells = [
        entry.entry_date,
        entry.entry_direction,
        entry.type_name,
        entry.sub_type_name ?? "",
        entry.explanation,
        formatAmountForCsv(entry.amount),
        entry.currency_code,
        entry.remark ?? "",
        entry.actor_display_name
      ].map(escapeCsvCell);
      lines.push(cells.join(","));
    }

    const csv = lines.join("\r\n");
    const today = new Date().toISOString().slice(0, 10);
    const filename = `big-book-export-${today}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export ledger entries.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
