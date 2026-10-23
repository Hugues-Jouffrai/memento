/** Pure mail-body rules: HTML to text, footer stripping, user-note split (R-CAP-07, R-CAP-08, R-CAP-09). */

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", rsquo: "’", lsquo: "‘", hellip: "…", ndash: "–", mdash: "—" };

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&(#39|[a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

/** HTML body to readable text. Drops scripts, styles, comments and images (tracking pixels). */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, inner: string) => {
      const label = inner.replace(/<[^>]+>/g, "").trim();
      return !label || label === href || !/^https?:/i.test(href) ? label || href : `${label} (${href})`;
    })
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return normalizeSpace(decodeEntities(text));
}

export function normalizeSpace(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const FOOTER_LINE =
  /(unsubscribe|se d[ée]sinscrire|d[ée]sabonner|view (this email )?in (your )?browser|voir (cet e-?mail )?dans (le|votre) navigateur|manage (your )?preferences|you (are )?receiv(ed|ing) this (email|e-mail)|vous recevez cet e-?mail|privacy policy|politique de confidentialit[ée])/i;

/** Removes the signature (after "-- ") and newsletter footer lines. */
export function stripFooters(text: string): string {
  const sig = text.search(/^-- ?$/m);
  const body = sig >= 0 ? text.slice(0, sig) : text;
  return normalizeSpace(
    body
      .split("\n")
      .filter((l) => !FOOTER_LINE.test(l))
      .join("\n"),
  );
}

const FORWARD_MARKER =
  /^[>\s]*(-{2,}\s*(forwarded message|message transf[ée]r[ée]|message transmis|original message|message d['’]origine)\s*-{2,}|begin forwarded message:?)\s*$/im;
const HEADER_LINE = /^(from|de|to|à|date|subject|objet|sujet|cc|reply-to)\s*:/i;

export interface ParsedMail {
  /** The user's own words: subject plus any text that is not forwarded content. */
  note: string;
  /** Forwarded content, or null when the whole mail is the user's own text. */
  forwarded: string | null;
  /** The cleaned body without the subject: what identifies the content for dedup (R-PIPE-03). */
  dedupText: string;
  /** The text that becomes the source. */
  sourceText: string;
  sourceKind: "email_body" | "user_note";
  /** An instruction for extraction ("focus on X"); empty when the note is itself the source. */
  instruction: string;
  title: string;
}

export function cleanSubject(subject: string | null | undefined): string {
  return (subject ?? "").replace(/[\r\n]+/g, " ").replace(/^\s*((re|fwd?|tr|fw)\s*:\s*)+/i, "").trim();
}

export function parseMail(input: { subject?: string | null; text?: string | null; html?: string | null }): ParsedMail {
  const raw = input.text?.trim() ? input.text : input.html ? htmlToText(input.html) : "";
  const body = stripFooters(normalizeSpace(raw));
  const title = cleanSubject(input.subject);
  const marker = FORWARD_MARKER.exec(body);
  if (marker) {
    const before = body.slice(0, marker.index).trim();
    const lines = body.slice(marker.index + marker[0].length).split("\n");
    let i = 0;
    while (i < lines.length && (lines[i]!.trim() === "" || HEADER_LINE.test(lines[i]!.trim()))) i++;
    const forwarded = normalizeSpace(lines.slice(i).join("\n").replace(/^[> ]+/gm, ""));
    const note = [title, before].filter(Boolean).join("\n").trim();
    if (forwarded) {
      return { note, forwarded, dedupText: forwarded, sourceText: forwarded, sourceKind: "email_body", instruction: before, title };
    }
  }
  const note = [title, body].filter(Boolean).join("\n").trim();
  return { note, forwarded: null, dedupText: body, sourceText: note, sourceKind: "user_note", instruction: "", title };
}
