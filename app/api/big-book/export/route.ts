import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth-api";
import { BIG_BOOK_CSV_EXPORT_HEADERS } from "@/lib/big-book/csv";
import { bigBookEntriesQuerySchema } from "@/lib/validation/big-book";
import { getBigBookEntries } from "@/lib/db/queries";
import { createClient } from "@/lib/supabase/server";

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
    vendorTypeId: searchParams.getAll("vendorTypeId"),
    vendorId: searchParams.getAll("vendorId"),
    pocketId: searchParams.getAll("pocketId"),
    creditFlag: searchParams.getAll("creditFlag"),
    creditStatus: searchParams.getAll("creditStatus"),
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
      vendorTypeId: parsed.data.vendorTypeId,
      vendorId: parsed.data.vendorId,
      pocketId: parsed.data.pocketId,
      creditFlag: parsed.data.creditFlag,
      creditStatus: parsed.data.creditStatus,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      query: parsed.data.query,
      limit: 100000
    });

    const groupIds = [...new Set(entries.map((entry) => entry.group_id).filter((id): id is string => Boolean(id)))];
    const groupMap = new Map<string, { label: string; remark: string | null }>();
    if (groupIds.length) {
      const supabase = await createClient();
      const { data: groups, error: groupsError } = await supabase
        .from("business_ledger_entry_groups")
        .select("id, label, remark")
        .in("id", groupIds);
      if (groupsError) throw groupsError;
      for (const group of groups ?? []) {
        groupMap.set(group.id, { label: group.label, remark: group.remark ?? null });
      }
    }

    const sortedEntries = [...entries].sort((a, b) => {
      const aGroup = a.group_id ?? "";
      const bGroup = b.group_id ?? "";
      if (aGroup !== bGroup) {
        if (!aGroup) return 1;
        if (!bGroup) return -1;
        return aGroup.localeCompare(bGroup);
      }
      if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? 1 : -1;
      return a.created_at < b.created_at ? 1 : -1;
    });

    const lines: string[] = [];
    lines.push(BIG_BOOK_CSV_EXPORT_HEADERS.join(","));
    for (const entry of sortedEntries) {
      const group = entry.group_id ? groupMap.get(entry.group_id) : null;
      const cells = [
        entry.entry_date,
        entry.entry_direction,
        entry.type_name,
        entry.sub_type_name ?? "",
        entry.vendor_type_name ?? "",
        entry.vendor_name ?? "",
        entry.explanation,
        formatAmountForCsv(entry.amount),
        entry.currency_code,
        entry.remark ?? "",
        entry.actor_display_name,
        entry.pocket_name ?? "",
        group?.label ?? "",
        group?.remark ?? "",
        entry.is_credit ? "true" : "false",
        entry.credit_status ?? "",
        entry.is_credit ? formatAmountForCsv(entry.outstanding) : "",
        entry.settles_entry?.explanation ?? ""
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
