import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/auth-api";
import { bigBookAttachmentViewSchema } from "@/lib/validation/big-book";

const BUCKET = "big-book-attachments";

export async function GET(request: Request) {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = bigBookAttachmentViewSchema.safeParse({ id: searchParams.get("id") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Attachment ID is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("business_ledger_attachments")
    .select(
      `
      id, storage_path, file_name,
      business_ledger_entries!inner(id, brand_id)
      `
    )
    .eq("id", parsed.data.id)
    .eq("business_ledger_entries.brand_id", authCheck.activeBrandId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const adminClient = createAdminClient();
  const signed = await adminClient.storage.from(BUCKET).createSignedUrl(row.storage_path, 60 * 10);
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ error: signed.error?.message ?? "Failed to create signed URL." }, { status: 400 });
  }

  return NextResponse.json({
    url: signed.data.signedUrl,
    file_name: row.file_name
  });
}
