// Dev tool: builds capture fixtures with a real renderer: a "screenshot of an article" PNG and an image-only (scanned) PDF.
// Usage: pnpm tsx scripts/make-fixtures.ts <output-dir>
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

const out = process.argv[2];
if (!out) {
  console.error("Usage: make-fixtures.ts <output-dir>");
  process.exit(1);
}
mkdirSync(out, { recursive: true });

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
writeFileSync(path.join(out, "capture-article.png"), png);

// A scanned PDF: one page that is only a picture (no text layer).
const doc = await PDFDocument.create();
const img = await doc.embedPng(png);
const pdfPage = doc.addPage([img.width * 0.75, img.height * 0.75]);
pdfPage.drawImage(img, { x: 0, y: 0, width: img.width * 0.75, height: img.height * 0.75 });
writeFileSync(path.join(out, "scan-article.pdf"), await doc.save());
console.log("wrote", path.join(out, "capture-article.png"), "and", path.join(out, "scan-article.pdf"));
