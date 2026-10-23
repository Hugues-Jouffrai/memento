import type { SupabaseClient } from "@supabase/supabase-js";

/** Where the original files (PDFs, images) are kept, so a source can always be re-read (R-KB-01). */
export interface FileStore {
  save(path: string, data: Buffer, contentType: string): Promise<void>;
}

/** Private `originals` bucket: no policy exists, so only the service role reads or writes it. */
export function createOriginalsStore(db: SupabaseClient): FileStore {
  return {
    async save(path, data, contentType) {
      const { error } = await db.storage.from("originals").upload(path, data, { contentType, upsert: true });
      if (error) throw new Error(`storage upload failed: ${error.message}`);
    },
  };
}

/** A path made only of safe characters: `<user>/<capture>/<name>`. */
export function originalPath(userId: string, captureId: string, filename: string): string {
  const safe = filename.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 100) || "file";
  return `${userId}/${captureId}/${safe}`;
}
