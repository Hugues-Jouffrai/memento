/**
 * How many cards the user asked for in their own words (R-CAP-14, D64). Pure and deterministic: no model.
 * French and English. A number counts only when it sits next to cards/flashcards/questions (or after a verb like
 * "make"/"crée"), so years, phone numbers, durations and unrelated numbers never misfire. "Fiches" is not a card (D55).
 */

export const MAX_REQUESTED_CARDS = 30;

const FR_UNITS = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const EN_UNITS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];

/** Number words (accents already removed) to their value, 1 to 30. */
const WORDS: Record<string, number> = {};
function addWord(word: string, n: number) {
  WORDS[word.replaceAll("-", " ")] = n;
}
for (let n = 1; n <= 19; n++) {
  addWord(FR_UNITS[n]!, n);
  addWord(EN_UNITS[n]!, n);
}
WORDS.une = 1;
addWord("vingt", 20);
addWord("twenty", 20);
addWord("trente", 30);
addWord("thirty", 30);
for (let n = 1; n <= 9; n++) {
  if (n === 1) {
    addWord("vingt-et-un", 21);
    addWord("vingt-et-une", 21);
  } else addWord(`vingt-${FR_UNITS[n]}`, 20 + n);
  addWord(`twenty-${EN_UNITS[n]}`, 20 + n);
}

const NUMBER_WORDS = Object.keys(WORDS)
  .sort((a, b) => b.length - a.length)
  .map((w) => w.replaceAll(" ", "[-\\s]+"))
  .join("|");

const BEFORE = String.raw`(?<![\p{L}\p{N}])`;
const AFTER = String.raw`(?![\p{L}\p{N}])`;
const NOUN = String.raw`(?:flash\s?cards?|cards?|cartes?(?:\s+memoire)?|questions?)`;
const NUM = String.raw`(\d{1,3}|${NUMBER_WORDS})`;

/** Word between the number and the noun ("10 good cards"); a unit of time or size there means it is not a card count. */
const NOT_AN_ADJECTIVE = /^(minutes?|mins?|secondes?|seconds?|heures?|hours?|jours?|days?|semaines?|weeks?|mois|months?|ans?|annees?|years?|pages?|mots?|words?|euros?|dollars?|fois|times|of|de|d|sur|on|about|and|et|or|ou|per|par)$/;

/** Verbs of asking for something to be made. */
const VERB = String.raw`(?:cree[rz]?s?|crees|fais|faire|faites|fait|genere[rz]?s?|donne[rz]?s?|prepare[rz]?s?|propose[rz]?s?|ecris|ecrire|ecrivez|redige[rz]?s?|veux|voudrais|aimerais|souhaite|souhaiterais|make|makes|create|generate|give|write|produce|prepare|draft|want|need|wanted|would\s+like)`;
const VERB_RE = new RegExp(`${BEFORE}${VERB}${AFTER}`, "u");

const WITH_NOUN = new RegExp(`${BEFORE}${NUM}\\s+(?:([\\p{L}']+)\\s+)?(${NOUN})${AFTER}`, "gu");
const LABELLED = new RegExp(`${BEFORE}(${NOUN})\\s*[:=]\\s*${NUM}${AFTER}(?![.,:/]\\d)`, "gu");
/** "crée-moi 10." / "make 10": a verb, up to two filler words, and the number alone. */
const AFTER_VERB = new RegExp(`${BEFORE}${VERB}(?:[-\\s]+[\\p{L}']+){0,2}[-\\s]+${NUM}(?=\\s*(?:[.!?,;]|$|\\n))`, "gmu");

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'");
}

function toNumber(raw: string): number | null {
  const token = raw.trim();
  const n = /^\d+$/.test(token) ? Number(token) : WORDS[token.replace(/[-\s]+/g, " ")];
  return n !== undefined && Number.isInteger(n) && n >= 1 ? n : null;
}

/** A digit number written next to other digits, or as part of a decimal, date, time or phone number, is not a count. */
function digitContextOk(text: string, index: number, raw: string): boolean {
  if (!/^\d/.test(raw)) return true;
  const prev = text[index - 1] ?? "";
  if (/[.,:/+\-@#€$%]/.test(prev)) return false;
  if (/\d[ .\-/]$/.test(text.slice(Math.max(0, index - 2), index))) return false;
  return true;
}

/** The sentence the match sits in, up to the match. */
function sentenceBefore(text: string, index: number): string {
  const head = text.slice(0, index);
  const cut = Math.max(head.lastIndexOf("."), head.lastIndexOf("!"), head.lastIndexOf("?"), head.lastIndexOf("\n"), head.lastIndexOf(";"));
  return head.slice(cut + 1);
}

interface Hit {
  index: number;
  n: number;
}

/**
 * The first valid request in the text, clamped to 1..30, or null.
 * Singular ("une carte", "one card") and "questions" are ambiguous ("une carte" is also a map, "j'ai deux questions"
 * is not a request), so they count only after a verb of asking in the same sentence.
 */
export function parseCardRequest(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = fold(text);
  const hits: Hit[] = [];
  const clamp = (n: number) => Math.min(n, MAX_REQUESTED_CARDS);

  for (const m of t.matchAll(WITH_NOUN)) {
    const [, rawNumber, between, noun] = m;
    if (!rawNumber || !noun) continue;
    if (between && NOT_AN_ADJECTIVE.test(between)) continue;
    if (!digitContextOk(t, m.index, rawNumber)) continue;
    const n = toNumber(rawNumber);
    if (n === null) continue;
    const ambiguous = n === 1 || /^questions?$/.test(noun);
    if (ambiguous && !VERB_RE.test(sentenceBefore(t, m.index))) continue;
    hits.push({ index: m.index, n: clamp(n) });
  }
  for (const m of t.matchAll(LABELLED)) {
    const [, , rawNumber] = m;
    const noun = m[1];
    if (!rawNumber || !noun) continue;
    const n = toNumber(rawNumber);
    if (n === null) continue;
    if (/^questions?$/.test(noun) && !VERB_RE.test(sentenceBefore(t, m.index))) continue;
    hits.push({ index: m.index, n: clamp(n) });
  }
  for (const m of t.matchAll(AFTER_VERB)) {
    const rawNumber = m[1];
    if (!rawNumber) continue;
    const at = m.index + m[0].lastIndexOf(rawNumber);
    if (!digitContextOk(t, at, rawNumber)) continue;
    const n = toNumber(rawNumber);
    if (n === null || n === 1) continue;
    hits.push({ index: m.index, n: clamp(n) });
  }
  hits.sort((a, b) => a.index - b.index);
  return hits[0]?.n ?? null;
}

/**
 * Prompt variables for the v3 prompts of enrich, claims and cards. Both are empty strings without a request, which
 * keeps the default instructions (1 to 8 cards, typically 3 to 5). From 8 up, claims are asked for in a range of
 * about half the cards up to as many as cards, since the most important facts can give a second card.
 */
export function requestPromptVars(requested: number | null | undefined): { requested: string; claimsRange: string } {
  if (!requested) return { requested: "", claimsRange: "" };
  return { requested: String(requested), claimsRange: requested >= 8 ? `${Math.ceil(requested / 2)} to ${requested}` : "" };
}

/** The first request among the user's words, in order of priority (note first, then the instruction). */
export function firstCardRequest(...texts: (string | null | undefined)[]): number | null {
  for (const text of texts) {
    const n = parseCardRequest(text);
    if (n !== null) return n;
  }
  return null;
}
