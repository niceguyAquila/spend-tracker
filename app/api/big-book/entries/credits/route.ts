import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth-api";
import { getBigBookOpenCreditsForPicker } from "@/lib/db/queries";
import { bigBookCreditsPickerQuerySchema } from "@/lib/validation/big-book";

export async function GET(request: Request) {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = bigBookCreditsPickerQuerySchema.safeParse({
    query: searchParams.get("query") ?? "",
    limit: searchParams.get("limit") ?? undefined
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const credits = await getBigBookOpenCreditsForPicker(parsed.data);
    return NextResponse.json({ credits });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load credit entries.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
