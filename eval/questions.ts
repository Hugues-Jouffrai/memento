/**
 * Eval of open-question extraction (R-KB-14, prompt claims/v4). There is no gold list: whether a question is real is a
 * judgment call, so the run prints every question for a human spot check (gate: no question that one of the source's own
 * claims answers, none about the author or the document). Mechanical checks catch the obvious defects.
 */
const ABOUT_THE_DOCUMENT = /\b(l['’]auteur|l['’]article|le document|le texte|the author|the article|the document|the text|the video|la vidéo)\b/i;

/** Defects a question must not have; an empty list means it passes the mechanical checks. */
export function questionDefects(q: string): string[] {
  const defects: string[] = [];
  if (!q.trim().endsWith("?")) defects.push("no question mark");
  if (q.length > 200) defects.push("longer than 200 characters");
  if (ABOUT_THE_DOCUMENT.test(q)) defects.push("about the document or its author");
  return defects;
}
