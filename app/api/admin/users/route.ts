import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/auth-api";
import { hasTrustedOrigin } from "@/lib/security/origin";

const updateSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "finance", "viewer"]).optional(),
  display_name: z.string().trim().min(1).max(120).nullable().optional(),
  is_active: z.boolean().optional()
});

export async function GET() {
  const adminCheck = await requireAdminApi();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: adminCheck.message }, { status: adminCheck.status });
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("allowed_users")
    .select("id, auth_user_id, email, display_name, role, is_active, invited_at, updated_at")
    .order("invited_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ users: data ?? [] });
}

export async function PATCH(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const adminCheck = await requireAdminApi();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: adminCheck.message }, { status: adminCheck.status });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const payload: { role?: string; is_active?: boolean; display_name?: string | null } = {};
  if (parsed.data.role) payload.role = parsed.data.role;
  if (parsed.data.display_name !== undefined) payload.display_name = parsed.data.display_name;
  if (typeof parsed.data.is_active === "boolean") payload.is_active = parsed.data.is_active;

  const adminClient = createAdminClient();
  const { error } = await adminClient.from("allowed_users").update(payload).eq("email", email);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Keep user_metadata role in sync for existing auth users.
  if (parsed.data.role) {
    const { data: listed } = await adminClient.auth.admin.listUsers();
    const user = listed.users.find((item) => item.email?.toLowerCase() === email);
    if (user) {
      await adminClient.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...(user.user_metadata ?? {}),
          role: parsed.data.role,
          ...(parsed.data.display_name !== undefined
            ? { display_name: parsed.data.display_name }
            : {})
        }
      });
    }
  }

  if (parsed.data.display_name !== undefined && !parsed.data.role) {
    const { data: listed } = await adminClient.auth.admin.listUsers();
    const user = listed.users.find((item) => item.email?.toLowerCase() === email);
    if (user) {
      await adminClient.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...(user.user_metadata ?? {}),
          display_name: parsed.data.display_name
        }
      });
    }
  }

  return NextResponse.json({ ok: true });
}
