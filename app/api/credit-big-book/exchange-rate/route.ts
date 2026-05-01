import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth-api";
import { convertCurrencyWithCoinbase } from "@/lib/exchange-rate";
import { creditBookExchangeRateQuerySchema } from "@/lib/validation/credit-big-book";

export async function GET(request: Request) {
  const authCheck = await requireAdminApi();
  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = creditBookExchangeRateQuerySchema.safeParse({
    amount: searchParams.get("amount"),
    base_currency: searchParams.get("base_currency"),
    quote_currency: searchParams.get("quote_currency")
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const quote = await convertCurrencyWithCoinbase(parsed.data);
    return NextResponse.json(quote);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch exchange rate.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
