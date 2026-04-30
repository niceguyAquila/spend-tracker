import { cookies } from "next/headers";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";

import { authCookieOverrides } from "@/lib/security/cookies";

export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase server environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)."
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items: Parameters<SetAllCookies>[0]) {
        try {
          const overrides = authCookieOverrides();
          items.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              ...overrides
            });
          });
        } catch {
          // Server Components may not allow mutating cookies directly.
        }
      }
    }
  });
}
