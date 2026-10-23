import { describe, expect, it } from "vitest";
import { MAX_ATTACHMENT_BYTES, classifyAttachment, hasUsableTextLayer, planAttachments, type AttachmentMeta } from "@/domain/attachments";

const att = (over: Partial<AttachmentMeta>): AttachmentMeta => ({ id: "a", filename: "f.bin", contentType: "application/octet-stream", size: 50_000, disposition: "attachment", ...over });

describe("[R-CAP-07] attachment types", () => {
  it("recognises PDFs by type or by extension", () => {
    expect(classifyAttachment(att({ contentType: "application/pdf", filename: "a.pdf" }))).toBe("pdf");
    expect(classifyAttachment(att({ contentType: "application/octet-stream", filename: "Rapport.PDF" }))).toBe("pdf");
  });
  it("accepts photos and screenshots the vision model can read", () => {
    for (const t of ["image/png", "image/jpeg", "image/webp", "image/heic"]) expect(classifyAttachment(att({ contentType: t, filename: "x" }))).toBe("image");
  });
  it("lists other formats as unsupported", () => {
    for (const t of ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "audio/mpeg", "image/gif", "text/calendar"])
      expect([t, classifyAttachment(att({ contentType: t }))]).toEqual([t, "unsupported"]);
  });
});

describe("[R-CAP-09] signature logos and tracking pixels are noise, not attachments", () => {
  it("skips inline images and tiny images", () => {
    expect(classifyAttachment(att({ contentType: "image/png", disposition: "inline", size: 80_000 }))).toBe("noise");
    expect(classifyAttachment(att({ contentType: "image/jpeg", size: 400 }))).toBe("noise");
  });
  it("does not list noise as ignored files", () => {
    const plan = planAttachments([att({ filename: "logo.png", contentType: "image/png", disposition: "inline" }), att({ filename: "px.gif", contentType: "image/gif", size: 43 })]);
    expect(plan.chosen).toBeNull();
    expect(plan.ignored).toEqual([]);
  });
});

describe("[R-CAP-07][R-CAP-10] choosing and limiting", () => {
  it("takes the PDF first and lists the other files as ignored", () => {
    const plan = planAttachments([
      att({ id: "1", filename: "photo.jpg", contentType: "image/jpeg" }),
      att({ id: "2", filename: "doc.pdf", contentType: "application/pdf" }),
      att({ id: "3", filename: "notes.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
    ]);
    expect(plan.chosen).toMatchObject({ id: "2", kind: "pdf" });
    expect(plan.ignored.sort()).toEqual(["notes.docx", "photo.jpg"]);
  });
  it("takes the first image when there is no PDF", () => {
    const plan = planAttachments([att({ id: "1", filename: "a.png", contentType: "image/png" }), att({ id: "2", filename: "b.png", contentType: "image/png" })]);
    expect(plan.chosen).toMatchObject({ id: "1", kind: "image" });
    expect(plan.ignored).toEqual(["b.png"]);
  });
  it("flags a file above 25 MB as too large instead of crashing", () => {
    expect(planAttachments([att({ contentType: "application/pdf", size: MAX_ATTACHMENT_BYTES + 1 })]).tooLarge).toBe(true);
    expect(planAttachments([att({ contentType: "application/pdf", size: MAX_ATTACHMENT_BYTES })]).tooLarge).toBe(false);
  });
  it("no attachments, no plan", () => {
    expect(planAttachments([])).toEqual({ chosen: null, ignored: [], tooLarge: false });
  });
});

describe("PDF text layer detection", () => {
  it("a scan has (almost) no text per page; a normal PDF has plenty", () => {
    expect(hasUsableTextLayer("", 10)).toBe(false);
    expect(hasUsableTextLayer("12 \n 13", 10)).toBe(false);
    expect(hasUsableTextLayer("mot ".repeat(400), 10)).toBe(true);
  });
});
