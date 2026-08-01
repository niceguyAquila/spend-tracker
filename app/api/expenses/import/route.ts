import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { parseSpendingCsv, spendingDedupeKey } from "@/lib/spending/csv";
import { ensureUncategorizedCategory } from "@/lib/spending/uncategorized";
import { expenseInputSchema } from "@/lib/validation/expense";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5000;
const UPSERT_CHUNK_SIZE = 500;

function normalizeLookupKey(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireFinanceApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required." }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "CSV file must be 2 MB or smaller." }, { status: 400 });
  }

  const content = await file.text();
  const parsed = parseSpendingCsv(content);
  if (parsed.errors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "Validation failed",
        errors: parsed.errors,
        total_rows: parsed.rows.length
      },
      { status: 400 }
    );
  }
  if (!parsed.rows.length) {
    return NextResponse.json({ error: "No data rows found in CSV." }, { status: 400 });
  }
  if (parsed.rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `CSV has ${parsed.rows.length} rows; the limit is ${MAX_ROWS}.` },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const brandId = authCheck.activeBrandId;

  const [
    { data: categories, error: categoriesError },
    { data: types, error: typesError },
    { data: staffRows, error: staffError }
  ] = await Promise.all([
    supabase
      .from("expense_categories")
      .select("id, name, is_active")
      .eq("brand_id", brandId)
      .eq("is_active", true),
    supabase
      .from("expense_types")
      .select("id, name, is_active")
      .eq("brand_id", brandId)
      .eq("is_active", true),
    supabase
      .from("expense_staff")
      .select("id, name, is_active")
      .eq("brand_id", brandId)
      .eq("is_active", true)
  ]);

  if (categoriesError || typesError || staffError) {
    return NextResponse.json(
      {
        error:
          categoriesError?.message ?? typesError?.message ?? staffError?.message ?? "Failed to load lookups."
      },
      { status: 400 }
    );
  }

  const categoryNameToId = new Map<string, string>();
  for (const row of categories ?? []) {
    categoryNameToId.set(normalizeLookupKey(row.name), row.id);
  }
  const typeNameToId = new Map<string, string>();
  for (const row of types ?? []) {
    typeNameToId.set(normalizeLookupKey(row.name), row.id);
  }
  const staffNameToId = new Map<string, string>();
  for (const row of staffRows ?? []) {
    staffNameToId.set(normalizeLookupKey(row.name), row.id);
  }

  let uncategorizedCategoryId: string | null = null;

  async function resolveUncategorizedCategory(): Promise<string> {
    if (uncategorizedCategoryId) return uncategorizedCategoryId;
    const created = await ensureUncategorizedCategory(supabase, brandId);
    uncategorizedCategoryId = created.id;
    categoryNameToId.set(normalizeLookupKey(created.name), created.id);
    return created.id;
  }

  type ResolvedRow = {
    expense_date: string;
    entry_direction: "spending" | "profit";
    currency_code: "IDR" | "MYR" | "USDT" | "TRX";
    category_id: string;
    type_id: string | null;
    staff_id: string | null;
    amount: number;
    description: string;
    remarks: string;
  };

  const records: ResolvedRow[] = [];
  const validationErrors: string[] = [];

  for (let index = 0; index < parsed.rows.length; index += 1) {
    const lineNumber = index + 2;
    const row = parsed.rows[index];

    let categoryId: string | null = null;
    if (row.category_name) {
      categoryId = categoryNameToId.get(normalizeLookupKey(row.category_name)) ?? null;
    }
    if (!categoryId) {
      try {
        categoryId = await resolveUncategorizedCategory();
      } catch (error) {
        validationErrors.push(
          `Row ${lineNumber}: ${error instanceof Error ? error.message : "Failed to resolve Uncategorized category."}`
        );
        continue;
      }
    }

    // Blank or unknown type/staff import as null (no Uncategorized fallback).
    const typeId = row.type_name ? (typeNameToId.get(normalizeLookupKey(row.type_name)) ?? null) : null;
    const staffId = row.staff_name ? (staffNameToId.get(normalizeLookupKey(row.staff_name)) ?? null) : null;

    const candidate = {
      expense_date: row.expense_date,
      entry_direction: row.entry_direction,
      currency_code: row.currency_code,
      category_id: categoryId,
      type_id: typeId,
      staff_id: staffId,
      amount: row.amount,
      description: row.description ?? "",
      remarks: row.remarks ?? ""
    };

    const schemaValidation = expenseInputSchema.safeParse(candidate);
    if (!schemaValidation.success) {
      const flattened = schemaValidation.error.flatten();
      const fieldError =
        Object.values(flattened.fieldErrors)
          .flat()
          .find((value) => typeof value === "string") ??
        flattened.formErrors.find((value) => typeof value === "string");
      validationErrors.push(`Row ${lineNumber}: ${fieldError ?? "invalid row data."}`);
      continue;
    }

    records.push({
      expense_date: schemaValidation.data.expense_date,
      entry_direction: schemaValidation.data.entry_direction,
      currency_code: schemaValidation.data.currency_code,
      category_id: schemaValidation.data.category_id,
      type_id: schemaValidation.data.type_id ?? null,
      staff_id: schemaValidation.data.staff_id ?? null,
      amount: schemaValidation.data.amount,
      description: schemaValidation.data.description ?? "",
      remarks: schemaValidation.data.remarks ?? ""
    });
  }

  if (validationErrors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "Validation failed",
        errors: validationErrors,
        total_rows: parsed.rows.length
      },
      { status: 400 }
    );
  }

  const seen = new Set<string>();
  const uniqueRecords: ResolvedRow[] = [];
  let skippedInFile = 0;
  for (const row of records) {
    const key = spendingDedupeKey(row);
    if (seen.has(key)) {
      skippedInFile += 1;
      continue;
    }
    seen.add(key);
    uniqueRecords.push(row);
  }

  const actorId = authCheck.user.id;
  let processed = 0;
  let skippedDuplicates = skippedInFile;
  const insertErrors: string[] = [];

  for (let i = 0; i < uniqueRecords.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = uniqueRecords.slice(i, i + UPSERT_CHUNK_SIZE).map((row) => ({
      expense_date: row.expense_date,
      brand_id: brandId,
      entry_direction: row.entry_direction,
      currency_code: row.currency_code,
      category_id: row.category_id,
      type_id: row.type_id,
      staff_id: row.staff_id,
      amount: row.amount,
      description: row.description || null,
      remarks: row.remarks || null,
      source: "csv_import",
      created_by: actorId,
      updated_by: actorId
    }));

    const { data, error } = await supabase.from("expenses").upsert(chunk, { ignoreDuplicates: true }).select("id");

    if (error) {
      insertErrors.push(error.message);
      continue;
    }

    const inserted = data?.length ?? 0;
    processed += inserted;
    skippedDuplicates += chunk.length - inserted;
  }

  if (insertErrors.length && processed === 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "Import failed",
        errors: insertErrors.slice(0, 25),
        total_rows: parsed.rows.length
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: insertErrors.length === 0,
    processed,
    skipped_duplicates: skippedDuplicates,
    total_rows: parsed.rows.length,
    errors: insertErrors.slice(0, 25)
  });
}
