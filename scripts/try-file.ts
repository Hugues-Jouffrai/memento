// Dev tool: read a PDF or an image with the REAL vision model (like the pipeline's `transcribe` stage), then extract
// claims and cards. No database. PDFs with a text layer are read locally unless --vision is given.
// Usage: pnpm tsx --env-file=.env.local scripts/try-file.ts <path> ["note"] [--vision]
import { readFileSync } from "node:fs";
import path from "node:path";
import { hasUsableTextLayer } from "../src/domain/attachments";
import { createDefaultGateway } from "../src/ai/factory";
import { createMemorySink } from "../src/ai/sinks";
import { readPdfText } from "../src/server/pdf";
import { MAX_SOURCE_CHARS, enrichNote, extractClaims, proposeCards, transcribeFile } from "../src/server/stages";

const args = process.argv.slice(2);
const forceVision = args.includes("--vision");
const [file, note = ""] = args.filter((a) => a !== "--vision");
if (!file) {
  console.error('Usage: try-file.ts <path> ["note"] [--vision]');
  process.exit(1);
}
const ext = path.extname(file).toLowerCase();
const mimeType = ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
const data = readFileSync(file);

const sink = createMemorySink();
const ai = createDefaultGateway(sink);

let text = "";
let how = "vision";
if (mimeType === "application/pdf" && !forceVision) {
  const layer = await readPdfText(data).catch(() => null);
  if (layer && hasUsableTextLayer(layer.text, layer.pages)) {
    text = layer.text;
    how = `pdf text layer (${layer.pages} pages)`;
  }
}
if (!text) {
  const out = await transcribeFile(ai, "dev", { mimeType, data }, note);
  text = out.text;
  how = `vision (title: ${out.title}, language: ${out.language})`;
}
console.log(`SOURCE via ${how}: ${text.length} chars\n--- text ---\n${text.slice(0, 1200)}${text.length > 1200 ? "\n[...]" : ""}\n------------`);

const body = text.slice(0, MAX_SOURCE_CHARS);
const sparse = mimeType !== "application/pdf" && body.length < 1500;
const extracted = sparse ? await enrichNote({ ai } as never, "dev", body) : await extractClaims({ ai } as never, "dev", body, note);
console.log(`\nTOPIC: ${extracted.topic} (${extracted.language}); ${sparse ? "enriched" : "quoted"}`);
console.log("CLAIMS:\n" + extracted.claims.map((c, i) => `  ${i + 1}. [${c.origin}] ${c.text}`).join("\n"));
const { accepted } = await proposeCards(ai, "dev", extracted.claims.map((c) => c.text));
console.log("CARDS:\n" + accepted.map((c) => `  #${c.rank} Q: ${c.question}\n      A: ${c.answer}`).join("\n"));
const cost = sink.calls.reduce((n, c) => n + (c.costUsd ?? 0), 0);
console.log(`\n${sink.calls.length} AI calls: ${sink.calls.map((c) => `${c.stage} ${c.latencyMs}ms ${c.inputTokens}in/${c.outputTokens}out`).join(", ")}; cost $${cost.toFixed(5)}`);
