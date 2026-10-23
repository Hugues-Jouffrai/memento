/** Pure attachment rules (R-CAP-07, R-CAP-09, R-CAP-10): what is read, what is ignored, what is too big. */

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
/** Scanned PDFs and images are sent to the vision model inline; above this they are refused. */
export const MAX_VISION_BYTES = 15 * 1024 * 1024;
/** Smaller inline images are signature logos and tracking pixels, not captures. */
export const MIN_IMAGE_BYTES = 15_000;

export interface AttachmentMeta {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  /** "inline" for pictures embedded in the body (signatures, logos). */
  disposition: string | null;
}

export type AttachmentKind = "pdf" | "image" | "unsupported" | "noise";

/** Image types the vision model accepts. */
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif"]);

export function classifyAttachment(a: AttachmentMeta): AttachmentKind {
  const type = a.contentType.toLowerCase().split(";")[0]!.trim();
  const name = a.filename.toLowerCase();
  if (type === "application/pdf" || (type === "application/octet-stream" && name.endsWith(".pdf"))) return "pdf";
  if (type.startsWith("image/")) {
    if (a.disposition?.toLowerCase() === "inline" || a.size < MIN_IMAGE_BYTES) return "noise";
    return IMAGE_TYPES.has(type) ? "image" : "unsupported";
  }
  return "unsupported";
}

export interface AttachmentPlan {
  /** The one attachment that becomes the source (PDFs first, then images, in mail order). */
  chosen: (AttachmentMeta & { kind: "pdf" | "image" }) | null;
  /** Filenames the receipt lists as ignored: unsupported files and supported ones beyond the first. */
  ignored: string[];
  /** The chosen file is above the size limit: the capture fails with a clear receipt (R-CAP-10). */
  tooLarge: boolean;
}

export function planAttachments(list: readonly AttachmentMeta[]): AttachmentPlan {
  const kinds = list.map((a) => ({ a, kind: classifyAttachment(a) }));
  const supported = kinds.filter((k): k is { a: AttachmentMeta; kind: "pdf" | "image" } => k.kind === "pdf" || k.kind === "image");
  const chosen = supported.find((k) => k.kind === "pdf") ?? supported[0] ?? null;
  const ignored = kinds
    .filter((k) => k.kind === "unsupported" || (k.kind !== "noise" && k !== chosen && supported.includes(k as never)))
    .map((k) => k.a.filename);
  return {
    chosen: chosen ? { ...chosen.a, kind: chosen.kind } : null,
    ignored,
    tooLarge: chosen ? chosen.a.size > MAX_ATTACHMENT_BYTES : false,
  };
}

/** A text layer is usable when it carries a reasonable amount of text per page; otherwise the PDF is a scan. */
export function hasUsableTextLayer(text: string, pages: number): boolean {
  return text.trim().length >= Math.max(1, pages) * 100;
}
