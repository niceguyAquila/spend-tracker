import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApi } from "@/lib/auth-api";
import { assertCsrfAndOrigin } from "@/lib/security/origin";
import { bigBookActorUpdateSchema } from "@/lib/validation/big-book";

export async function GET() {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const supabase = await createClient();
  const [actorsRes, usersRes] = await Promise.all([
    supabase.from("big_book_actors").select("id, actor_code, display_name, user_id").order("actor_code"),
    supabase
      .from("allowed_users")
      .select("id, email, display_name")
      .eq("is_active", true)
      .order("display_name", { ascending: true })
  ]);

  if (actorsRes.error || usersRes.error) {
    return NextResponse.json({ error: actorsRes.error?.message ?? usersRes.error?.message }, { status: 400 });
  }

  return NextResponse.json({
    actors: actorsRes.data ?? [],
    users:
      usersRes.data?.map((user) => ({
        id: user.id,
        email: user.email,
        display_name: user.display_name?.trim() || user.email
      })) ?? []
  });
}

export async function PATCH(request: Request) {
  if (!(await assertCsrfAndOrigin(request))) {
    return NextResponse.json({ error: "Invalid request origin or CSRF token." }, { status: 403 });
  }

  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await request.json();
  const parsed = bigBookActorUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...payload } = parsed.data;
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No fields provided to update." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("big_book_actors").update(payload).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
