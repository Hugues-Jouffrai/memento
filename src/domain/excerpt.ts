/** Excerpt grounding (R-KB-05): an excerpt must be found in the source text. */

export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the excerpt appears in the source, ignoring case, quote styles and whitespace. */
export function isGrounded(excerpt: string, source: string): boolean {
  const e = normalizeForMatch(excerpt);
  return e.length > 0 && normalizeForMatch(source).includes(e);
}
