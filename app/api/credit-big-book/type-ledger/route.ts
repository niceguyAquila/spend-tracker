import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth-api";
import {
  getCreditBookEntriesPaged,
  getCreditBookTypeMonthlyCurrencySummary
} from "@/lib/db/queries";
import { z } from "zod";

const querySchema = z.object({
  typeId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  currencyCode: z.array(z.string()).optional(),
  direction: z.array(z.enum(["credit", "debt"])).optional(),
  page: z.coerce.number().int().min(0).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional()
});

export async function GET(request: Request) {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    typeId: searchParams.get("typeId") ?? "",
    year: searchParams.get("year") ?? undefined,
    dateFrom: searchParams.get("dateFrom") || undefined,
    dateTo: searchParams.get("dateTo") || undefined,
    currencyCode: searchParams.getAll("currencyCode"),
    direction: searchParams.getAll("direction"),
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const year = parsed.data.year ?? new Date().getUTCFullYear();

  try {
    const [entriesPage, monthlyRows] = await Promise.all([
      getCreditBookEntriesPaged({
        typeId: [parsed.data.typeId],
        dateFrom: parsed.data.dateFrom,
        dateTo: parsed.data.dateTo,
        currencyCode: parsed.data.currencyCode?.length ? parsed.data.currencyCode : undefined,
        direction: parsed.data.direction?.length
          ? (parsed.data.direction as Array<"credit" | "debt">)
          : undefined,
        page: parsed.data.page ?? 0,
        pageSize: parsed.data.pageSize ?? 20
      }),
      getCreditBookTypeMonthlyCurrencySummary(parsed.data.typeId, year)
    ]);

    const availableYears = [year + 1, year, year - 1, year - 2, year - 3].filter((y) => y >= 2000);

    return NextResponse.json({
      entries: entriesPage.rows,
      totalCount: entriesPage.totalCount,
      monthlyRows,
      availableYears,
      year
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load type ledger.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
