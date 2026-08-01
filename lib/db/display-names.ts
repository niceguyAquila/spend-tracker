import { createAdminClient } from "@/lib/supabase/admin";
import { perfStart } from "@/lib/perf";

/**
 * Maps auth user id -> rendered display name.
 *
 * Actor ids are only known after ledger rows have been fetched, so resolving
 * names used to add a dependent round trip at the very end of every read.
 * allowed_users is a tiny, slowly changing table, so the whole directory is
 * loaded once per warm instance instead.
 */
type DisplayNameDirectory = Map<string, string>;

const CACHE_TTL_MS = (() => {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return 0;
  const raw = Number(process.env.DISPLAY_NAME_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 60_000;
})();

let cached: { directory: DisplayNameDirectory; expiresAt: number } | null = null;
let inflight: Promise<DisplayNameDirectory | null> | null = null;

export function invalidateDisplayNameDirectory(): void {
  cached = null;
}

async function fetchDirectory(): Promise<DisplayNameDirectory | null> {
  const end = perfStart("displayNameDirectory");
  try {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("allowed_users")
      .select("auth_user_id, display_name, email");

    if (error || !data) return null;

    const directory: DisplayNameDirectory = new Map();
    for (const row of data) {
      if (!row.auth_user_id) continue;
      directory.set(row.auth_user_id, row.display_name?.trim() || row.email || row.auth_user_id);
    }
    return directory;
  } catch {
    return null;
  } finally {
    end();
  }
}

/**
 * Returns null when the directory cannot be loaded, so callers can fall back to
 * a scoped lookup rather than rendering raw uuids.
 */
export async function loadDisplayNameDirectory(): Promise<DisplayNameDirectory | null> {
  if (CACHE_TTL_MS <= 0) return fetchDirectory();

  if (cached && cached.expiresAt > Date.now()) return cached.directory;
  if (inflight) return inflight;

  inflight = fetchDirectory()
    .then((directory) => {
      if (directory) {
        cached = { directory, expiresAt: Date.now() + CACHE_TTL_MS };
      }
      return directory;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
