// Dev tool: (re)builds the committed fixtures of the attachment eval (eval/file-fixtures) with known content, so the
// expectations are exact and need no review: an article screenshot (PNG), the same page as an image-only (scanned)
// PDF, and a PDF with a real text layer. Usage: pnpm tsx scripts/make-eval-file-fixtures.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const root = path.join(process.cwd(), "eval", "file-fixtures");
const put = (id: string, name: string, data: Uint8Array | string) => {
  mkdirSync(path.join(root, id), { recursive: true });
  writeFileSync(path.join(root, id, name), data);
};

const html = `<html><body style="font:20px/1.5 Georgia,serif;width:760px;margin:30px;background:#fff;color:#111">
<h1 style="font-size:34px">Les quipus : écrire sans alphabet</h1>
<p>Dans l'Empire inca, l'administration ne disposait d'aucune écriture alphabétique. Elle employait des <b>quipus</b>, des ensembles de cordelettes nouées de couleurs différentes.</p>
<p>Chaque nœud, sa position et sa couleur codaient un nombre ou une catégorie. Les <b>quipucamayocs</b>, fonctionnaires spécialisés, enregistraient ainsi les recensements, les récoltes et les impôts en travail, la <i>mit'a</i>.</p>
<p>La lecture des quipus reste en partie mystérieuse : seuls les quipus numériques sont bien compris aujourd'hui.</p>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 840, height: 520 } });
await page.setContent(html);
const png = await page.screenshot({ type: "png" });
await browser.close();

const quipusExpect = (route: string) => `# Generated with known content by scripts/make-eval-file-fixtures.ts (no review needed).
language: fr
route: ${route}
must_transcribe:
  - { id: quipu, any: ["quipus"] }
  - { id: quipucamayoc, any: ["quipucamayocs"] }
  - { id: mita, any: ["mit'a", "mit’a"] }
  - { id: mysterieuse, any: ["mystérieuse"] }
must_cover:
  - { id: quipu, any: ["quipu"] }
  - { id: quipucamayoc, any: ["quipucamayoc"] }
  - { id: mita, any: ["mit'a", "mit’a", "mita"] }
`;

put("fr-quipus-screenshot", "input.png", png);
put("fr-quipus-screenshot", "expect.yaml", quipusExpect("vision"));

const scan = await PDFDocument.create();
const img = await scan.embedPng(png);
const scanPage = scan.addPage([img.width * 0.75, img.height * 0.75]);
scanPage.drawImage(img, { x: 0, y: 0, width: img.width * 0.75, height: img.height * 0.75 });
put("fr-quipus-scan-pdf", "input.pdf", await scan.save());
put("fr-quipus-scan-pdf", "expect.yaml", quipusExpect("vision"));

const paragraphs = [
  "The Rosetta Stone",
  "The Rosetta Stone is a fragment of a larger granodiorite stele inscribed in 196 BC, during the reign of Ptolemy V. It records a decree issued by a council of priests at Memphis that confirmed the royal cult. The decree is written three times: in Egyptian hieroglyphs, in Demotic script and in Ancient Greek.",
  "French soldiers found the stone in July 1799 near the town of Rashid, called Rosetta by Europeans, in the Nile Delta, during Napoleon's campaign in Egypt. After the French defeat, the Treaty of Alexandria of 1801 gave the stone to Britain, and it has been in the British Museum since 1802.",
  "Because scholars could read Ancient Greek, the Greek text gave a key to the other two. Thomas Young showed in the 1810s that some hieroglyphs spell the name of Ptolemy inside cartouches. Jean-Francois Champollion announced in 1822 that hieroglyphs combine phonetic signs with signs for ideas, which opened the reading of ancient Egyptian.",
];
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const pg = pdf.addPage([595, 842]);
let y = 780;
paragraphs.forEach((p, i) => {
  const f = i === 0 ? bold : font;
  const size = i === 0 ? 22 : 12;
  let line = "";
  const flush = () => {
    pg.drawText(line, { x: 50, y, size, font: f });
    y -= size * 1.5;
    line = "";
  };
  for (const word of p.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (f.widthOfTextAtSize(next, size) > 495) flush();
    line = line ? `${line} ${word}` : word;
  }
  flush();
  y -= 10;
});
put("en-rosetta-textlayer-pdf", "input.pdf", await pdf.save());
put(
  "en-rosetta-textlayer-pdf",
  "expect.yaml",
  `# Generated with known content by scripts/make-eval-file-fixtures.ts (no review needed).
language: en
route: text-layer
must_transcribe:
  - { id: year_found, any: ["1799"] }
  - { id: place, any: ["Rashid"] }
  - { id: demotic, any: ["Demotic"] }
  - { id: champollion, any: ["Champollion"] }
must_cover:
  - { id: found_1799, any: ["1799"] }
  - { id: three_scripts, any: ["Demotic"] }
  - { id: champollion, any: ["Champollion"] }
  - { id: british_museum, any: ["British Museum"] }
  - { id: ptolemy, any: ["Ptolemy"] }
`,
);
console.log("wrote fixtures in", root);
