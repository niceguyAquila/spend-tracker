import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/auth-api";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const adminCheck = await requireAdminApi();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: adminCheck.message }, { status: adminCheck.status });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return NextResponse.json(
      {
        sessionUser: null,
        userError: userError?.message ?? "No active session",
        allowedLookup: null
      },
      { status: 401 }
    );
  }

  const email = user.email.trim().toLowerCase();
  const admin = createAdminClient();
  const normalizedLookup = await admin
    .from("allowed_users")
    .select("email, normalized_email, role, is_active")
    .eq("normalized_email", email)
    .maybeSingle();

  const fallbackLookup = await admin
    .from("allowed_users")
    .select("email, normalized_email, role, is_active")
    .ilike("email", email)
    .maybeSingle();

  return NextResponse.json({
    sessionUser: {
      email: user.email,
      id: user.id
    },
    normalizedLookup: normalizedLookup.data ?? null,
    normalizedLookupError: normalizedLookup.error?.message ?? null,
    fallbackLookup: fallbackLookup.data ?? null,
    fallbackLookupError: fallbackLookup.error?.message ?? null
  });
}
