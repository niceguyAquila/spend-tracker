import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth-api";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { createAdminClient } from "@/lib/supabase/admin";

const resetPasswordSchema = z.object({
  email: z.string().email(),
  temporary_password: z
    .string()
    .min(8, "Temporary password must be at least 8 characters.")
    .max(128, "Temporary password is too long.")
    .regex(/[a-z]/, "Temporary password must include a lowercase letter.")
    .regex(/[A-Z]/, "Temporary password must include an uppercase letter.")
    .regex(/[0-9]/, "Temporary password must include a number.")
});

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const adminCheck = await requireAdminApi();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: adminCheck.message }, { status: adminCheck.status });
  }

  const body = await request.json();
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Invalid request payload.";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const adminClient = createAdminClient();
  const { data: allowedUser, error: allowedUserError } = await adminClient
    .from("allowed_users")
    .select("auth_user_id, normalized_email")
    .eq("normalized_email", normalizedEmail)
    .maybeSingle();

  if (allowedUserError) {
    return NextResponse.json({ error: allowedUserError.message }, { status: 400 });
  }

  if (!allowedUser) {
    return NextResponse.json({ error: "Allowed user not found." }, { status: 404 });
  }

  let authUserId = allowedUser.auth_user_id;
  if (!authUserId) {
    const listedUsers = await adminClient.auth.admin.listUsers();
    if (listedUsers.error) {
      return NextResponse.json({ error: "Failed to resolve auth user." }, { status: 400 });
    }
    const authUser = listedUsers.data.users.find((item) => item.email?.toLowerCase() === normalizedEmail);
    if (!authUser) {
      return NextResponse.json({ error: "Auth user not found for this email." }, { status: 404 });
    }
    authUserId = authUser.id;
    await adminClient.from("allowed_users").update({ auth_user_id: authUserId }).eq("normalized_email", normalizedEmail);
  }

  const { error: resetError } = await adminClient.auth.admin.updateUserById(authUserId, {
    password: parsed.data.temporary_password
  });
  if (resetError) {
    return NextResponse.json({ error: "Failed to reset password." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
