import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";

const updateSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "finance", "viewer"]).optional(),
  display_name: z.string().trim().min(1).max(120).nullable().optional(),
  is_active: z.boolean().optional(),
  brand_roles: z
    .array(
      z.object({
        brand_id: z.string().uuid(),
        role: z.enum(["admin", "finance", "viewer"]),
        is_active: z.boolean().default(true)
      })
    )
    .optional()
});

export async function GET() {
  const adminCheck = await requireAdminApi();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: adminCheck.message }, { status: adminCheck.status });
  }

  const adminClient = createAdminClient();
  const [{ data, error }, { data: brandRoles, error: brandRoleError }, { data: brands, error: brandsError }] =
    await Promise.all([
      adminClient
        .from("allowed_users")
        .select("id, auth_user_id, email, display_name, role, is_active, invited_at, updated_at")
        .order("invited_at", { ascending: false }),
      adminClient
        .from("user_brand_roles")
        .select("allowed_user_id, brand_id, role, is_active"),
      adminClient
        .from("brands")
        .select("id, code, name, is_active")
        .order("created_at", { ascending: true })
    ]);

  if (error || brandRoleError || brandsError) {
    return NextResponse.json(
      { error: error?.message ?? brandRoleError?.message ?? brandsError?.message ?? "Failed to load users." },
      { status: 400 }
    );
  }

  const userRows = (data ?? []).map((user) => ({
    ...user,
    brand_roles: (brandRoles ?? []).filter((item) => item.allowed_user_id === user.id)
  }));

  return NextResponse.json({ users: userRows, brands: brands ?? [] });
}

export async function PATCH(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
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
  const { data: userRow, error: userRowError } = await adminClient
    .from("allowed_users")
    .select("id, auth_user_id, normalized_email")
    .eq("normalized_email", email)
    .maybeSingle();
  if (userRowError) {
    return NextResponse.json({ error: userRowError.message }, { status: 400 });
  }
  if (!userRow) {
    return NextResponse.json({ error: "Allowed user not found." }, { status: 404 });
  }

  if (parsed.data.is_active === false && adminCheck.user.email?.toLowerCase() === email) {
    return NextResponse.json({ error: "You cannot deactivate your own admin account." }, { status: 400 });
  }

  if (Object.keys(payload).length > 0) {
    const { error } = await adminClient.from("allowed_users").update(payload).eq("id", userRow.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  if (parsed.data.brand_roles) {
    await adminClient.from("user_brand_roles").delete().eq("allowed_user_id", userRow.id);
    if (parsed.data.brand_roles.length > 0) {
      const { error: roleError } = await adminClient.from("user_brand_roles").insert(
        parsed.data.brand_roles.map((item) => ({
          allowed_user_id: userRow.id,
          brand_id: item.brand_id,
          role: item.role,
          is_active: item.is_active
        }))
      );
      if (roleError) {
        return NextResponse.json({ error: roleError.message }, { status: 400 });
      }
    }
  }

  // Keep user_metadata role in sync for existing auth users.
  if (parsed.data.role || parsed.data.display_name !== undefined) {
    const authUserId = userRow.auth_user_id;
    if (authUserId) {
      const { data: authUserData } = await adminClient.auth.admin.getUserById(authUserId);
      await adminClient.auth.admin.updateUserById(authUserId, {
        user_metadata: {
          ...(authUserData.user?.user_metadata ?? {}),
          ...(parsed.data.role ? { role: parsed.data.role } : {}),
          ...(parsed.data.display_name !== undefined ? { display_name: parsed.data.display_name } : {})
        }
      });
    } else {
      const { data: listed } = await adminClient.auth.admin.listUsers();
      const user = listed.users.find((item) => item.email?.toLowerCase() === email);
      if (user) {
        await adminClient.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...(user.user_metadata ?? {}),
            ...(parsed.data.role ? { role: parsed.data.role } : {}),
            ...(parsed.data.display_name !== undefined ? { display_name: parsed.data.display_name } : {})
          }
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
