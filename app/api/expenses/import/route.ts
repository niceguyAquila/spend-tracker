import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { parseSpendingCsv, spendingDedupeKey } from "@/lib/spending/csv";
import {
  ensureUncategorizedCategory,
  ensureUncategorizedSubcategory
} from "@/lib/spending/uncategorized";
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

  const [{ data: categories, error: categoriesError }, { data: subcategories, error: subcategoriesError }] =
    await Promise.all([
      supabase
        .from("expense_categories")
        .select("id, name, is_active")
        .eq("brand_id", brandId)
        .eq("is_active", true),
      supabase
        .from("expense_subcategories")
        .select("id, category_id, name, is_active")
        .eq("brand_id", brandId)
        .eq("is_active", true)
    ]);

  if (categoriesError || subcategoriesError) {
    return NextResponse.json(
      { error: categoriesError?.message ?? subcategoriesError?.message ?? "Failed to load categories." },
      { status: 400 }
    );
  }

  const categoryNameToId = new Map<string, string>();
  for (const row of categories ?? []) {
    categoryNameToId.set(normalizeLookupKey(row.name), row.id);
  }

  // Sub-category names are unique only within a parent category.
  const subKeyToId = new Map<string, string>();
  for (const row of subcategories ?? []) {
    subKeyToId.set(`${row.category_id}::${normalizeLookupKey(row.name)}`, row.id);
  }

  let uncategorizedCategoryId: string | null = null;
  const uncategorizedSubByCategory = new Map<string, string>();

  async function resolveUncategorizedCategory(): Promise<string> {
    if (uncategorizedCategoryId) return uncategorizedCategoryId;
    const created = await ensureUncategorizedCategory(supabase, brandId);
    uncategorizedCategoryId = created.id;
    categoryNameToId.set(normalizeLookupKey(created.name), created.id);
    return created.id;
  }

  async function resolveUncategorizedSubcategory(categoryId: string): Promise<string> {
    const cached = uncategorizedSubByCategory.get(categoryId);
    if (cached) return cached;
    const created = await ensureUncategorizedSubcategory(supabase, brandId, categoryId);
    uncategorizedSubByCategory.set(categoryId, created.id);
    subKeyToId.set(`${categoryId}::${normalizeLookupKey(created.name)}`, created.id);
    return created.id;
  }

  type ResolvedRow = {
    expense_date: string;
    entry_direction: "spending" | "profit";
    category_id: string;
    subcategory_id: string;
    amount: number;
    note: string;
    reference: string;
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

    let subcategoryId: string | null = null;
    if (row.subcategory_name) {
      subcategoryId = subKeyToId.get(`${categoryId}::${normalizeLookupKey(row.subcategory_name)}`) ?? null;
    }
    if (!subcategoryId) {
      try {
        subcategoryId = await resolveUncategorizedSubcategory(categoryId);
      } catch (error) {
        validationErrors.push(
          `Row ${lineNumber}: ${error instanceof Error ? error.message : "Failed to resolve Uncategorized sub-category."}`
        );
        continue;
      }
    }

    const candidate = {
      expense_date: row.expense_date,
      entry_direction: row.entry_direction,
      category_id: categoryId,
      subcategory_id: subcategoryId,
      amount: row.amount,
      note: row.note ?? "",
      reference: row.reference ?? ""
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
      category_id: schemaValidation.data.category_id,
      subcategory_id: schemaValidation.data.subcategory_id,
      amount: schemaValidation.data.amount,
      note: schemaValidation.data.note ?? "",
      reference: schemaValidation.data.reference ?? ""
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

  // Collapse in-file duplicates on the same key as uq_expenses_dedupe.
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
      category_id: row.category_id,
      subcategory_id: row.subcategory_id,
      amount: row.amount,
      note: row.note || null,
      reference: row.reference || null,
      source: "csv_import",
      created_by: actorId,
      updated_by: actorId
    }));

    // ignoreDuplicates without onConflict becomes ON CONFLICT DO NOTHING, which
    // covers the expression-based uq_expenses_dedupe index. RETURNING only
    // yields rows that were actually inserted.
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
