import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/auth-api";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { bigBookAttachmentCreateSchema, bigBookAttachmentDeleteSchema } from "@/lib/validation/big-book";

const BUCKET = "big-book-attachments";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
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
  const ledgerEntryId = formData.get("ledger_entry_id");
  const file = formData.get("file");

  if (typeof ledgerEntryId !== "string") {
    return NextResponse.json({ error: "ledger_entry_id is required." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attachment file is required." }, { status: 400 });
  }

  const safeName = sanitizeFileName(file.name || "attachment");
  const storagePath = `entries/${ledgerEntryId}/${randomUUID()}-${safeName}`;
  const createInput = bigBookAttachmentCreateSchema.safeParse({
    ledger_entry_id: ledgerEntryId,
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
    .from("business_ledger_attachments")
    .insert({
      ledger_entry_id: createInput.data.ledger_entry_id,
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
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = bigBookAttachmentDeleteSchema.safeParse({ id: searchParams.get("id") });
  if (!parsed.success) {
    return NextResponse.json({ error: "Attachment ID is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: row, error: fetchError } = await supabase
    .from("business_ledger_attachments")
    .select(
      `
      id, storage_path, ledger_entry_id,
      business_ledger_entries!inner(id)
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

  const { error } = await supabase.from("business_ledger_attachments").delete().eq("id", row.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
