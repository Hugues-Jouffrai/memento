import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { buildExportFiles, csvCell, pageMarkdown, slug, toCsv, type ExportData } from "@/domain/export";

const data: ExportData = {
  email: "a@example.test",
  exportedAt: "2026-10-16T12:00:00.000Z",
  pages: [
    {
      id: "p1",
      title: "Les abeilles",
      created_at: "2026-10-15T10:00:00Z",
      summary: ["Elles dansent", "Elles butinent"],
      claims: [
        { id: "c1", text: "Les abeilles dansent pour indiquer le nectar.", origin: "source", status: "active", sources: [{ source_id: "s1", excerpt: "dansent" }] },
        { id: "c2", text: "Une ruche compte des milliers d'abeilles.", origin: "model", status: "active", sources: [] },
        { id: "c3", text: "Fait retiré.", origin: "source", status: "retired", sources: [] },
      ],
    },
    { id: "p2", title: "Les abeilles", created_at: "2026-10-15T11:00:00Z", summary: [], claims: [] },
  ],
  sources: [{ id: "s1", kind: "user_note", title: "Note du jour", url: null, language: "fr", created_at: "2026-10-15T09:00:00Z", extracted_text: "Les abeilles dansent, \"vraiment\".\nDeuxième ligne." }],
  cards: [{ id: "k1", status: "active", question: "Pourquoi dansent-elles ?", answer: "Pour indiquer le nectar.", page_title: "Les abeilles", source_id: "s1", created_at: "2026-10-15T12:00:00Z", due: "2026-10-17T00:00:00Z", reps: 2, lapses: 0 }],
  reviews: [{ card_id: "k1", rating: 3, reviewed_at: "2026-10-16T08:00:00Z", duration_ms: 7000 }],
};

describe("account export", () => {
  it("[R-SEC-06] makes one Markdown file per page, a README and three CSV files", () => {
    expect(Object.keys(buildExportFiles(data)).sort()).toEqual(["README.txt", "cards.csv", "pages/les-abeilles-2.md", "pages/les-abeilles.md", "reviews.csv", "sources.csv"]);
  });
  it("[R-SEC-06] a page lists its active claims with their source, marks AI-added ones and hides retired ones", () => {
    const md = pageMarkdown(data.pages[0]!, () => "Note du jour");
    expect(md).toContain("# Les abeilles");
    expect(md).toContain("- Elles dansent");
    expect(md).toContain("- Les abeilles dansent pour indiquer le nectar. [Note du jour]");
    expect(md).toContain("added by the AI");
    expect(md).not.toContain("Fait retiré");
  });
  it("[R-SEC-06] CSV cells with commas, quotes and line breaks survive a round trip", () => {
    const csv = buildExportFiles(data)["sources.csv"]!;
    expect(csv.split("\r\n")[0]).toBe("id,kind,title,url,language,captured_at,text");
    expect(csv).toContain('"Les abeilles dansent, ""vraiment"".\nDeuxième ligne."');
  });
  it("[R-SEC-06] cards and reviews carry the schedule", () => {
    const files = buildExportFiles(data);
    expect(files["cards.csv"]).toContain("k1,active,Pourquoi dansent-elles ?,Pour indiquer le nectar.,Les abeilles,s1");
    expect(files["reviews.csv"]).toContain("k1,3,2026-10-16T08:00:00Z,7000");
  });
  it("[R-SEC-06] text that could run as a spreadsheet formula is defused", () => {
    for (const evil of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd"]) expect(csvCell(evil).replace(/^"/, "").startsWith("'")).toBe(true);
    expect(csvCell("normal")).toBe("normal");
    expect(csvCell(null)).toBe("");
    expect(toCsv(["a"], [["=1"]])).toBe("a\r\n'=1\r\n");
  });
  it("file names are plain letters, digits and dashes", () => {
    expect(slug("Été à l'Île — 1789 !", "x")).toBe("ete-a-l-ile-1789");
    expect(slug("../../etc/passwd", "x")).toBe("etc-passwd");
    expect(slug("???", "page-3")).toBe("page-3");
  });
  it("the zip module round-trips text", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const files = buildExportFiles(data);
    const back = unzipSync(zipSync(Object.fromEntries(Object.entries(files).map(([n, t]) => [n, strToU8(t)]))));
    expect(strFromU8(back["README.txt"]!)).toContain("a@example.test");
  });
});
