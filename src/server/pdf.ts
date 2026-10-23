import { extractText, getDocumentProxy } from "unpdf";

export interface PdfText {
  text: string;
  pages: number;
}

/** Text layer of a PDF (free and exact, unlike vision). Throws on corrupt or encrypted files. */
export async function readPdfText(data: Buffer): Promise<PdfText> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { text: text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(), pages: totalPages };
}
