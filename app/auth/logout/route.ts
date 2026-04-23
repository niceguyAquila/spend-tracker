import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasTrustedOrigin } from "@/lib/security/origin";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const requestUrl = new URL(request.url);
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", requestUrl.origin));
}
