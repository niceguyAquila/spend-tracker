import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";

const inviteSchema = z.object({
  email: z.string().email(),
  display_name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(["admin", "finance", "viewer"]),
  brand_roles: z
    .array(
      z.object({
        brand_id: z.string().uuid(),
        role: z.enum(["admin", "finance", "viewer"])
      })
    )
    .min(1, "At least one brand role is required."),
  auth_method: z.enum(["password", "magic_link"]).default("password"),
  password: z.string().min(8).optional()
});

export async function POST(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const adminCheck = await requireAdminApi();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: adminCheck.message }, { status: adminCheck.status });
  }

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const normalizedEmail = parsed.data.email.toLowerCase();
  const normalizedDisplayName = parsed.data.display_name?.trim() || null;
  const authMethod = parsed.data.auth_method;

  const { error: upsertError } = await adminClient.from("allowed_users").upsert(
    {
      email: normalizedEmail,
      display_name: normalizedDisplayName,
      role: parsed.data.role,
      is_active: true
    },
    { onConflict: "email" }
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 });
  }

  const { data: allowedUserRow, error: allowedUserError } = await adminClient
    .from("allowed_users")
    .select("id")
    .eq("normalized_email", normalizedEmail)
    .single();
  if (allowedUserError) {
    return NextResponse.json({ error: allowedUserError.message }, { status: 400 });
  }

  await adminClient.from("user_brand_roles").delete().eq("allowed_user_id", allowedUserRow.id);
  const { error: insertRolesError } = await adminClient.from("user_brand_roles").insert(
    parsed.data.brand_roles.map((item) => ({
      allowed_user_id: allowedUserRow.id,
      brand_id: item.brand_id,
      role: item.role,
      is_active: true
    }))
  );
  if (insertRolesError) {
    return NextResponse.json({ error: insertRolesError.message }, { status: 400 });
  }

  const listedUsers = await adminClient.auth.admin.listUsers();
  const existingUser = listedUsers.data.users.find(
    (user) => user.email?.toLowerCase() === normalizedEmail
  );
  let inviteError: { message: string } | null = null;

  if (authMethod === "password") {
    if (!parsed.data.password) {
      return NextResponse.json({ error: "Password is required for password auth." }, { status: 400 });
    }

    if (existingUser) {
      const { error } = await adminClient.auth.admin.updateUserById(existingUser.id, {
        password: parsed.data.password,
        email_confirm: true,
        user_metadata: {
          ...(existingUser.user_metadata ?? {}),
          role: parsed.data.role,
          display_name: normalizedDisplayName
        }
      });
      inviteError = error ? { message: error.message } : null;
      if (!error) {
        await adminClient
          .from("allowed_users")
          .update({ auth_user_id: existingUser.id })
          .eq("normalized_email", normalizedEmail);
      }
    } else {
      const { data: created, error } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password: parsed.data.password,
        email_confirm: true,
        user_metadata: { role: parsed.data.role, display_name: normalizedDisplayName }
      });
      inviteError = error ? { message: error.message } : null;
      if (!error && created.user) {
        await adminClient
          .from("allowed_users")
          .update({ auth_user_id: created.user.id })
          .eq("normalized_email", normalizedEmail);
      }
    }
  } else {
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback`;
    const { error } = await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
      data: { role: parsed.data.role, display_name: normalizedDisplayName },
      redirectTo
    });
    inviteError = error ? { message: error.message } : null;
    if (!error) {
      const listedUsers = await adminClient.auth.admin.listUsers();
      const invitedUser = listedUsers.data.users.find(
        (user) => user.email?.toLowerCase() === normalizedEmail
      );
      if (invitedUser) {
        await adminClient
          .from("allowed_users")
          .update({ auth_user_id: invitedUser.id })
          .eq("normalized_email", normalizedEmail);
      }
    }
  }

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, auth_method: authMethod });
}
