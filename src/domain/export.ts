/** Account export (R-SEC-06, D53): pages as Markdown, sources, cards and reviews as CSV. Pure: rows in, file contents out. */

export interface ExportPage {
  id: string;
  title: string;
  created_at: string;
  summary: string[];
  claims: { id: string; text: string; origin: "source" | "model"; status: string; sources: { source_id: string; excerpt: string }[] }[];
}
export interface ExportSource {
  id: string;
  kind: string;
  title: string | null;
  url: string | null;
  language: string | null;
  created_at: string;
  extracted_text: string;
}
export interface ExportCard {
  id: string;
  status: string;
  question: string;
  answer: string;
  page_title: string | null;
  source_id: string;
  created_at: string;
  due: string | null;
  reps: number | null;
  lapses: number | null;
}
export interface ExportReview {
  card_id: string;
  rating: number;
  reviewed_at: string;
  duration_ms: number | null;
}
export interface ExportData {
  email: string;
  exportedAt: string;
  pages: ExportPage[];
  sources: ExportSource[];
  cards: ExportCard[];
  reviews: ExportReview[];
}

/**
 * One CSV cell. Quotes when needed, and defuses spreadsheet formulas: a cell that starts with = + - @ tab or CR
 * gets a leading apostrophe, so opening the file in Excel never runs text that came from a web page or a mail.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** A file name that is safe on every system: letters, digits, dashes. */
export function slug(title: string, fallback: string): string {
  const s = title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return s || fallback;
}

export function pageMarkdown(page: ExportPage, sourceLabel: (id: string) => string): string {
  const out = [`# ${page.title}`, ""];
  if (page.summary.length) out.push(...page.summary.map((b) => `- ${b}`), "");
  out.push("## Claims", "");
  for (const c of page.claims.filter((x) => x.status === "active")) {
    const cites = c.sources.map((s) => sourceLabel(s.source_id));
    out.push(`- ${c.text}${c.origin === "model" ? " *(added by the AI, not from your sources)*" : ""}${cites.length ? ` [${[...new Set(cites)].join("; ")}]` : ""}`);
  }
  return out.join("\n") + "\n";
}

/** Every file of the export, by path inside the archive. Page file names are unique. */
export function buildExportFiles(d: ExportData): Record<string, string> {
  const label = new Map(d.sources.map((s) => [s.id, s.title?.trim() || s.url || s.id]));
  const files: Record<string, string> = {
    "README.txt": `Export of ${d.email}\nGenerated ${d.exportedAt}\n\npages/*.md   one Markdown file per topic page\nsources.csv  everything you sent, as read\ncards.csv    your flashcards and their schedule\nreviews.csv  your review history\n`,
  };
  const used = new Set<string>();
  d.pages.forEach((p, i) => {
    let name = slug(p.title, `page-${i + 1}`);
    while (used.has(name)) name += `-${i + 1}`;
    used.add(name);
    files[`pages/${name}.md`] = pageMarkdown(p, (id) => label.get(id) ?? id);
  });
  files["sources.csv"] = toCsv(["id", "kind", "title", "url", "language", "captured_at", "text"], d.sources.map((s) => [s.id, s.kind, s.title, s.url, s.language, s.created_at, s.extracted_text]));
  files["cards.csv"] = toCsv(["id", "status", "question", "answer", "page", "source_id", "created_at", "due", "reps", "lapses"], d.cards.map((c) => [c.id, c.status, c.question, c.answer, c.page_title, c.source_id, c.created_at, c.due, c.reps, c.lapses]));
  files["reviews.csv"] = toCsv(["card_id", "rating", "reviewed_at", "duration_ms"], d.reviews.map((r) => [r.card_id, r.rating, r.reviewed_at, r.duration_ms]));
  return files;
}
