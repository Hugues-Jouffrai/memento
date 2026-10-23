// Dev tool: run the extraction + card stages on a note with the REAL model, no database, and print the result.
// Usage: pnpm tsx --env-file=.env.local scripts/try-note.ts "<note text>" [--rich]
//   default: a personal note. A URL in it is fetched (like the pipeline does) and its page becomes the source;
//   without a URL a short note is enriched from the model's knowledge; --rich treats the text itself as a source to quote.
import { firstCardRequest } from "../src/domain/card-request";
import { extractUrls, stripUrls } from "../src/domain/links";
import { classifyPage } from "../src/domain/paywall";
import { createDefaultGateway } from "../src/ai/factory";
import { createMemorySink } from "../src/ai/sinks";
import { createPageFetcher } from "../src/server/fetcher";
import { MAX_SOURCE_CHARS, enrichNote, extractClaims, proposeCards } from "../src/server/stages";

const args = process.argv.slice(2);
const rich = args.includes("--rich");
const text = args.filter((a) => a !== "--rich").join(" ").trim();
if (!text) {
  console.error('Usage: try-note.ts "<note text>" [--rich]');
  process.exit(1);
}

const requested = firstCardRequest(stripUrls(text));
console.log(`REQUESTED CARDS: ${requested ?? "none"}`);
const sink = createMemorySink();
const ai = createDefaultGateway(sink);
const deps = { ai } as never;

const urls = rich ? [] : extractUrls(text);
let extracted;
if (urls.length) {
  const page = await createPageFetcher().fetchPage(urls[0]!);
  console.log(`PAGE: ${page.title} (${page.text.length} chars, ${classifyPage(page)}); instruction: "${stripUrls(text)}"`);
  extracted = await extractClaims(deps, "dev", page.text.slice(0, MAX_SOURCE_CHARS), stripUrls(text), requested);
} else {
  extracted = rich ? await extractClaims(deps, "dev", text, "", requested) : await enrichNote(deps, "dev", text, { requested });
}

console.log(`\nTOPIC: ${extracted.topic}  (language: ${extracted.language})`);
console.log("SUMMARY:\n" + extracted.summary.map((s) => `  - ${s}`).join("\n"));
console.log("CLAIMS:\n" + extracted.claims.map((c, i) => `  ${i + 1}. [${c.origin}] ${c.text}`).join("\n"));

const { accepted, rejected } = await proposeCards(ai, "dev", extracted.claims.map((c) => c.text), { requested });
console.log("\nCARDS:\n" + accepted.map((c) => `  #${c.rank} Q: ${c.question}\n      A: ${c.answer}`).join("\n"));
if (rejected.length) console.log("REJECTED:\n" + rejected.map((r) => `  (${r.reason}) ${r.card.question}`).join("\n"));

const cost = sink.calls.reduce((n, c) => n + (c.costUsd ?? 0), 0);
console.log(`\n${sink.calls.length} AI calls, ${sink.calls.map((c) => `${c.stage}:${c.latencyMs}ms`).join(", ")}, cost $${cost.toFixed(5)}`);
