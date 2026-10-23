import { describe, expect, it } from "vitest";
import type { AttachmentMeta } from "@/domain/attachments";
import { MAX_ITEMS_PER_MAIL, planItems } from "@/domain/items";

const att = (over: Partial<AttachmentMeta> & { id: string }): AttachmentMeta => ({
  filename: `${over.id}.pdf`,
  contentType: "application/pdf",
  size: 50_000,
  disposition: "attachment",
  ...over,
});
const img = (id: string) => att({ id, filename: `${id}.png`, contentType: "image/png" });

describe("[R-CAP-07] planItems", () => {
  it("reads every usable file and link: PDFs first, then images, then links", () => {
    const plan = planItems([img("i1"), att({ id: "p1" })], ["https://a.test/x", "https://b.test/y"]);
    expect(plan.items.map((i) => (i.kind === "file" ? i.file.filename : i.url))).toEqual(["p1.pdf", "i1.png", "https://a.test/x", "https://b.test/y"]);
    expect(plan.ignoredFiles).toEqual([]);
    expect(plan.ignoredUrls).toEqual([]);
  });

  it("lists unsupported formats as ignored and drops signature logos silently", () => {
    const plan = planItems(
      [att({ id: "d", filename: "notes.docx", contentType: "application/msword" }), att({ id: "logo", filename: "logo.png", contentType: "image/png", disposition: "inline" }), img("i1")],
      [],
    );
    expect(plan.items).toHaveLength(1);
    expect(plan.ignoredFiles).toEqual(["notes.docx"]);
  });

  it("caps the sources per mail and lists the overflow as ignored", () => {
    const plan = planItems([att({ id: "p1" }), att({ id: "p2" }), img("i1")], ["https://a.test/1", "https://a.test/2", "https://a.test/3"]);
    expect(plan.items).toHaveLength(MAX_ITEMS_PER_MAIL);
    expect(plan.ignoredFiles).toEqual([]);
    expect(plan.ignoredUrls).toEqual(["https://a.test/2", "https://a.test/3"]);
  });

  it("is empty for a plain note", () => {
    expect(planItems([], [])).toEqual({ items: [], ignoredFiles: [], ignoredUrls: [] });
  });
});
