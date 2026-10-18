import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type RpcError = { message?: string; code?: string; details?: string | null; hint?: string | null };

export class MissingDatabaseFunctionError extends Error {
  constructor(readonly functionName: string) {
    super(`Database function ${functionName} is missing. Apply supabase migrations.`);
    this.name = "MissingDatabaseFunctionError";
  }
}

/**
 * Missing only when PostgREST says so: PGRST202 naming `fn`. A "does not exist"
 * raised inside the function body is a real failure, not a missing function.
 */
export function isMissingFunctionError(error: RpcError | null | undefined, fn: string): boolean {
  if (!error || error.code !== "PGRST202") return false;
  return `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.includes(fn);
}

export async function callRpc<T>(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<{ data: T | null; error: RpcError | null }> {
  const { data, error } = await (
    supabase as unknown as {
      rpc: (name: string, params: Record<string, unknown>) => PromiseLike<{ data: T | null; error: RpcError | null }>;
    }
  ).rpc(fn, args);
  return { data, error };
}

/** Calls a function that must exist; a missing one throws MissingDatabaseFunctionError. */
export async function callRequiredRpc<T>(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<T> {
  const { data, error } = await callRpc<T>(supabase, fn, args);
  if (error) {
    if (isMissingFunctionError(error, fn)) throw new MissingDatabaseFunctionError(fn);
    throw error;
  }
  return data as T;
}
