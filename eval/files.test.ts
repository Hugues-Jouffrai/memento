import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasUsableTextLayer } from "../src/domain/attachments";
import { readPdfText } from "../src/server/pdf";
import { loadFileFixtures, missingItems } from "./files";

const FIXTURES = path.join(process.cwd(), "eval", "file-fixtures");

describe("file eval fixtures", () => {
  const fixtures = loadFileFixtures(FIXTURES);

  it("[R-EVAL-01] [R-CAP-07] has a text-layer PDF, a scanned PDF and an image, in FR and EN", () => {
    expect(fixtures.map((f) => f.mimeType).sort()).toEqual(["application/pdf", "application/pdf", "image/png"]);
    expect(new Set(fixtures.map((f) => f.expect.language))).toEqual(new Set(["fr", "en"]));
    expect(fixtures.every((f) => f.expect.must_cover.length > 0 && f.expect.must_transcribe.length > 0)).toBe(true);
  });

  it("[R-CAP-07] a PDF is read locally when it has a text layer and by vision when it is a scan, as each fixture expects", async () => {
    for (const f of fixtures.filter((x) => x.mimeType === "application/pdf")) {
      const layer = await readPdfText(readFileSync(f.file));
      const route = hasUsableTextLayer(layer.text, layer.pages) ? "text-layer" : "vision";
      expect(route, f.id).toBe(f.expect.route);
    }
  });

  it("[R-EVAL-01] every must-transcribe term of the text-layer PDF is in its real text layer (no ungrounded expectations)", async () => {
    const f = fixtures.find((x) => x.expect.route === "text-layer")!;
    const layer = await readPdfText(readFileSync(f.file));
    expect(missingItems(f.expect.must_transcribe, layer.text)).toEqual([]);
  });

  it("[R-EVAL-02] missingItems ignores case, accents and apostrophe style", () => {
    const items = [{ id: "a", any: ["mit'a"] }, { id: "b", any: ["quipucamayoc"] }];
    expect(missingItems(items, "La Mit’a et les QUIPUCAMAYOCS")).toEqual([]);
    expect(missingItems(items, "rien")).toEqual(["a", "b"]);
  });
});
