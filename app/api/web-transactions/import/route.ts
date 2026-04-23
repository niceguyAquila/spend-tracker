import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceApi } from "@/lib/auth-api";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { parseWebTransactionsCsv, type WebTransactionSourceSystem } from "@/lib/web-transactions/csv";

const UPSERT_CHUNK_SIZE = 500;

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const authCheck = await requireFinanceApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const formData = await request.formData();
  const sourceSystemRaw = formData.get("sourceSystem");
  const sourceSystem: WebTransactionSourceSystem =
    sourceSystemRaw === "backoffice" ? "backoffice" : "payment_gateway";
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required." }, { status: 400 });
  }
  const content = await file.text();
  const parsed = parseWebTransactionsCsv(content, sourceSystem);

  if (!parsed.rows.length && parsed.errors.length) {
    return NextResponse.json(
      {
        error: "No valid rows found in CSV.",
        details: parsed.errors
      },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const importTimestamp = new Date().toISOString();
  let processed = 0;
  const importErrors = [...parsed.errors];

  for (let i = 0; i < parsed.rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = parsed.rows.slice(i, i + UPSERT_CHUNK_SIZE).map((row) => ({
      ...row,
      status: row.canonical_status,
      payment_type: row.canonical_type,
      brand_id: authCheck.activeBrandId,
      source_file_name: file.name,
      imported_at: importTimestamp,
      imported_by: authCheck.user.id
    }));

    const { error } = await supabase
      .from("web_transactions")
      .upsert(chunk, { onConflict: "brand_id,source_system,external_txn_no" });
    if (error) {
      importErrors.push(error.message);
      continue;
    }
    processed += chunk.length;
  }

  return NextResponse.json({
    ok: importErrors.length === 0,
    processed,
    total_rows: parsed.rows.length,
    skipped_or_invalid: importErrors.length,
    errors: importErrors.slice(0, 25)
  });
}
