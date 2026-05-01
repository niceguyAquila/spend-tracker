import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import {
  creditBookSettlementAttachmentCreateSchema,
  creditBookSettlementAttachmentDeleteSchema
} from "@/lib/validation/credit-big-book";

const BUCKET = "credit-book-attachments";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const formData = await request.formData();
  const settlementId = formData.get("settlement_id");
  const file = formData.get("file");

  if (typeof settlementId !== "string") {
    return NextResponse.json({ error: "settlement_id is required." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attachment file is required." }, { status: 400 });
  }

  const safeName = sanitizeFileName(file.name || "attachment");
  const storagePath = `settlements/${settlementId}/${randomUUID()}-${safeName}`;
  const createInput = creditBookSettlementAttachmentCreateSchema.safeParse({
    settlement_id: settlementId,
    storage_path: storagePath,
    file_name: safeName,
    mime_type: file.type || "application/octet-stream",
    file_size: file.size
  });
  if (!createInput.success) {
    return NextResponse.json({ error: createInput.error.flatten() }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const uploadBuffer = Buffer.from(await file.arrayBuffer());
  const uploadRes = await adminClient.storage.from(BUCKET).upload(storagePath, uploadBuffer, {
    contentType: file.type,
    upsert: false
  });
  if (uploadRes.error) {
    return NextResponse.json({ error: uploadRes.error.message }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credit_ledger_settlement_attachments")
    .insert({
      settlement_id: createInput.data.settlement_id,
      storage_path: createInput.data.storage_path,
      file_name: createInput.data.file_name,
      mime_type: createInput.data.mime_type,
      file_size: createInput.data.file_size,
      uploaded_by: authCheck.user.id
    })
    .select("id")
    .single();

  if (error) {
    await adminClient.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.id });
}

export async function DELETE(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = creditBookSettlementAttachmentDeleteSchema.safeParse({ id: searchParams.get("id") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Attachment ID is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: row, error: fetchError } = await supabase
    .from("credit_ledger_settlement_attachments")
    .select(
      `
      id, storage_path, settlement_id,
      credit_ledger_settlements!inner(id)
      `
    )
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (fetchError || !row) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const adminClient = createAdminClient();
  const { error: storageError } = await adminClient.storage.from(BUCKET).remove([row.storage_path]);
  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 400 });
  }

  const { error } = await supabase
    .from("credit_ledger_settlement_attachments")
    .delete()
    .eq("id", row.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
