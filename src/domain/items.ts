/** What one mail contains to read (R-CAP-07): attachments and links, each becoming its own source (M3 step 0). */
import { classifyAttachment, type AttachmentMeta } from "./attachments";

/** At most this many sources are read per mail (cost and time bound); the rest is listed as ignored. */
export const MAX_ITEMS_PER_MAIL = 4;

export type MailItem =
  | { kind: "file"; file: AttachmentMeta & { kind: "pdf" | "image" } }
  | { kind: "url"; url: string };

export interface ItemPlan {
  /** In reading order: PDFs, then images, then links. */
  items: MailItem[];
  /** Filenames the receipt lists as ignored: unsupported formats and files beyond the cap. */
  ignoredFiles: string[];
  /** Links beyond the cap. */
  ignoredUrls: string[];
}

/**
 * Plans what to read. `urls` is empty for forwarded content (links inside a newsletter are never fetched, D32).
 * Noise (signature logos, tracking pixels) is dropped silently.
 */
export function planItems(attachments: readonly AttachmentMeta[], urls: readonly string[], max = MAX_ITEMS_PER_MAIL): ItemPlan {
  const classified = attachments.map((a) => ({ a, kind: classifyAttachment(a) }));
  const pick = (kind: "pdf" | "image"): MailItem[] =>
    classified.filter((c) => c.kind === kind).map((c) => ({ kind: "file", file: { ...c.a, kind } }));
  const all: MailItem[] = [...pick("pdf"), ...pick("image"), ...urls.map((url): MailItem => ({ kind: "url", url }))];
  const kept = all.slice(0, max);
  const dropped = all.slice(max);
  return {
    items: kept,
    ignoredFiles: [
      ...classified.filter((c) => c.kind === "unsupported").map((c) => c.a.filename),
      ...dropped.flatMap((i) => (i.kind === "file" ? [i.file.filename] : [])),
    ],
    ignoredUrls: dropped.flatMap((i) => (i.kind === "url" ? [i.url] : [])),
  };
}
