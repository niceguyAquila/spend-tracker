import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { parseBigBookCsv } from "@/lib/big-book/csv";
import { bigBookEntryInputSchema } from "@/lib/validation/big-book";

type NameToIdMap = Map<string, string>;

function normalizeLookupKey(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required." }, { status: 400 });
  }

  const content = await file.text();
  const parsed = parseBigBookCsv(content);
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

  const supabase = await createClient();

  const [{ data: types, error: typesError }, { data: actors, error: actorsError }] = await Promise.all([
    supabase.from("business_ledger_types").select("id,name").eq("is_active", true),
    supabase.from("big_book_actors").select("id,display_name")
  ]);

  if (typesError || actorsError) {
    return NextResponse.json(
      { error: typesError?.message ?? actorsError?.message ?? "Failed to load import references." },
      { status: 400 }
    );
  }

  const typeNameToId: NameToIdMap = new Map((types ?? []).map((row) => [normalizeLookupKey(row.name), row.id]));
  const actorNameToId: NameToIdMap = new Map((actors ?? []).map((row) => [normalizeLookupKey(row.display_name), row.id]));

  const validationErrors: string[] = [];
  const records = parsed.rows.map((row, index) => {
    const lineNumber = index + 2;
    const entryTypeId = typeNameToId.get(normalizeLookupKey(row.type_name));
    const actorId = actorNameToId.get(normalizeLookupKey(row.actor_name));

    if (!entryTypeId) {
      validationErrors.push(`Row ${lineNumber}: type_name '${row.type_name}' is not available.`);
    }
    if (!actorId) {
      validationErrors.push(`Row ${lineNumber}: actor_name '${row.actor_name}' is not available.`);
    }

    return {
      entry_date: row.entry_date,
      entry_direction: row.entry_direction,
      entry_type_id: entryTypeId ?? "",
      explanation: row.explanation,
      amount: row.amount,
      currency_code: row.currency_code,
      remark: row.remark ?? "",
      responsible_actor_id: actorId ?? ""
    };
  });

  for (let index = 0; index < records.length; index += 1) {
    const lineNumber = index + 2;
    const row = records[index];
    const schemaValidation = bigBookEntryInputSchema.safeParse(row);
    if (!schemaValidation.success) {
      const flattened = schemaValidation.error.flatten();
      const fieldError =
        Object.values(flattened.fieldErrors)
          .flat()
          .find((value) => typeof value === "string") ??
        flattened.formErrors.find((value) => typeof value === "string");
      validationErrors.push(`Row ${lineNumber}: ${fieldError ?? "invalid row data."}`);
    }
  }

  if (validationErrors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "Validation failed",
        errors: validationErrors,
        total_rows: records.length
      },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("business_ledger_entries").insert(
    records.map((row) => ({
      ...row,
      brand_id: authCheck.activeBrandId,
      remark: row.remark || null,
      created_by: authCheck.user.id,
      updated_by: authCheck.user.id
    }))
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    processed: records.length,
    total_rows: records.length
  });
}
