import { createAdminClient } from "@/lib/supabase/admin";

const QUEUE_TABLE = "business_ledger_attachment_purge_queue";
const DEFAULT_BATCH = 100;

export type PurgeResult = { removed: number; failed: number; error: string | null };

type QueueRow = { bucket_id: string; storage_path: string; attempts: number | null };

/**
 * Removes attachment files whose rows were deleted. A database trigger queues
 * every deleted attachment's storage path; this drains the queue through the
 * Storage API (the only way to delete the underlying object).
 *
 * Never throws: the ledger delete that called it has already committed, so a
 * storage hiccup must not turn a successful delete into an error. Anything not
 * confirmed removed stays queued and is retried by the next drain.
 */
export async function purgeQueuedAttachmentFiles(limit = DEFAULT_BATCH): Promise<PurgeResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(QUEUE_TABLE)
      .select("bucket_id, storage_path, attempts")
      .order("queued_at", { ascending: true })
      .limit(limit);
    if (error) return { removed: 0, failed: 0, error: error.message };

    const rows = (data ?? []) as QueueRow[];
    if (!rows.length) return { removed: 0, failed: 0, error: null };

    const byBucket = new Map<string, QueueRow[]>();
    for (const row of rows) {
      const list = byBucket.get(row.bucket_id) ?? [];
      list.push(row);
      byBucket.set(row.bucket_id, list);
    }

    let removed = 0;
    let failed = 0;
    let lastError: string | null = null;

    for (const [bucketId, bucketRows] of byBucket) {
      const paths = bucketRows.map((row) => row.storage_path);
      // Storage treats a path that no longer exists as nothing to do, so a file
      // already removed (e.g. by an earlier partial drain) still dequeues.
      const { error: removeError } = await admin.storage.from(bucketId).remove(paths);

      if (removeError) {
        failed += paths.length;
        lastError = removeError.message;
        const attemptAt = new Date().toISOString();
        for (const row of bucketRows) {
          await admin
            .from(QUEUE_TABLE)
            .update({
              attempts: (row.attempts ?? 0) + 1,
              last_error: removeError.message.slice(0, 500),
              last_attempt_at: attemptAt
            })
            .eq("bucket_id", bucketId)
            .eq("storage_path", row.storage_path);
        }
        continue;
      }

      const { error: dequeueError } = await admin
        .from(QUEUE_TABLE)
        .delete()
        .eq("bucket_id", bucketId)
        .in("storage_path", paths);
      if (dequeueError) lastError = dequeueError.message;
      removed += paths.length;
    }

    return { removed, failed, error: lastError };
  } catch (error) {
    return { removed: 0, failed: 0, error: error instanceof Error ? error.message : String(error) };
  }
}
