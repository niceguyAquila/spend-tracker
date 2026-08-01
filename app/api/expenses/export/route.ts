import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinanceApi } from "@/lib/auth-api";
import { escapeCsvCell, formatAmountForCsv } from "@/lib/csv/primitives";
import { SPENDING_CSV_EXPORT_HEADERS } from "@/lib/spending/csv";
import { getExpenses } from "@/lib/db/queries";

const MAX_EXPORT_ROWS = 50_000;

const exportQuerySchema = z.object({
  month: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  query: z.string().optional(),
  direction: z.array(z.enum(["spending", "profit"])).optional(),
  categoryId: z.array(z.string().uuid()).optional(),
  subcategoryId: z.array(z.string().uuid()).optional()
});

export async function GET(request: Request) {
  const authCheck = await requireFinanceApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = exportQuerySchema.safeParse({
    month: searchParams.get("month") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    query: searchParams.get("query") ?? undefined,
    direction: searchParams.getAll("direction").filter(Boolean),
    categoryId: searchParams.getAll("categoryId").filter(Boolean),
    subcategoryId: searchParams.getAll("subcategoryId").filter(Boolean)
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const filters = parsed.data;
  const rows = await getExpenses({
    brandId: authCheck.activeBrandId,
    month: filters.month || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    directions: filters.direction?.length ? filters.direction : undefined,
    categoryIds: filters.categoryId?.length ? filters.categoryId : undefined,
    subcategoryIds: filters.subcategoryId?.length ? filters.subcategoryId : undefined,
    limit: MAX_EXPORT_ROWS
  });

  const search = (filters.query ?? "").trim().toLowerCase();
  const filtered = search
    ? rows.filter((row) => {
        const haystack = [
          row.category_name,
          row.subcategory_name,
          row.note ?? "",
          row.reference ?? "",
          row.source,
          row.creator_display_name
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(search);
      })
    : rows;

  const lines: string[] = [];
  lines.push(SPENDING_CSV_EXPORT_HEADERS.join(","));
  for (const row of filtered) {
    const cells = [
      row.expense_date,
      row.entry_direction,
      row.category_name === "-" ? "" : row.category_name,
      row.subcategory_name === "-" ? "" : row.subcategory_name,
      formatAmountForCsv(Math.abs(Number(row.amount))),
      row.note ?? "",
      row.reference ?? "",
      row.source,
      row.creator_display_name === "-" ? "" : row.creator_display_name
    ].map(escapeCsvCell);
    lines.push(cells.join(","));
  }

  const csv = lines.join("\r\n");
  const today = new Date().toISOString().slice(0, 10);
  const filename = `spending-export-${today}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
