import { describe, expect, it } from "vitest";
import { requestPromptVars } from "@/domain/card-request";
import { loadPrompt, renderPrompt } from "./prompts";

const lf = (s: string) => s.replace(/\r\n/g, "\n");
const none = requestPromptVars(null);

describe("[R-AI-02] prompt sections", () => {
  it("keeps a section when the variable is not empty and an inverse section when it is empty", () => {
    expect(renderPrompt("a{{#x}} yes {{x}}{{/x}}{{^x}} no{{/x}}", { x: "1" })).toBe("a yes 1");
    expect(renderPrompt("a{{#x}} yes {{x}}{{/x}}{{^x}} no{{/x}}", { x: "" })).toBe("a no");
  });
  it("still fails on a missing variable, even inside a section", () => {
    expect(() => renderPrompt("{{#x}}y{{/x}}", {})).toThrow("x");
  });
});

describe("[R-CARD-08] prompts v3 take the requested count (D64)", () => {
  it("the latest versions are v3 and the old ones are untouched", () => {
    for (const stage of ["enrich", "cards"]) expect(loadPrompt(stage).version).toBe("v3");
    expect(loadPrompt("claims").version).toBe("v4");
    expect(loadPrompt("cards", "v2").template).toContain("{{claims}}");
    expect(loadPrompt("cards", "v2").template).not.toContain("{{requested}}");
  });

  it("cards/v3 without a request renders exactly the words of cards/v2", () => {
    const vars = { claims: "1. Un fait.\n2. Un autre fait." };
    const rendered = renderPrompt(loadPrompt("cards", "v3").template, { ...vars, ...none });
    expect(lf(rendered)).toBe(lf(renderPrompt(loadPrompt("cards", "v2").template, vars)));
    expect(rendered).toContain("1 to 8 cards");
    expect(rendered).toContain("typically 3 to 5, never more than 8");
    expect(rendered).toContain("Fewer good cards beat many weak ones");
  });

  it("enrich/v3 without a request renders exactly the words of enrich/v2", () => {
    const vars = { text: "Teotihuacan, visité hier." };
    expect(lf(renderPrompt(loadPrompt("enrich", "v3").template, { ...vars, ...none }))).toBe(lf(renderPrompt(loadPrompt("enrich", "v2").template, vars)));
  });

  it("claims/v3 without a request renders exactly the words of claims/v1", () => {
    const vars = { text: "Un texte.", instruction: "" };
    expect(lf(renderPrompt(loadPrompt("claims", "v3").template, { ...vars, ...none }))).toBe(lf(renderPrompt(loadPrompt("claims", "v1").template, vars)));
  });

  it("[R-KB-14] claims/v4 is claims/v3 plus the open_questions rule, and nothing else changes", () => {
    const vars = { text: "Un texte.", instruction: "", ...none };
    const v3 = lf(renderPrompt(loadPrompt("claims", "v3").template, vars));
    const v4 = lf(renderPrompt(loadPrompt("claims", "v4").template, vars));
    expect(v4).toContain('"open_questions": 0 to 3 questions, usually NONE');
    expect(v4).toContain("never ask what one of your claims already answers");
    expect(v4.replace(/- "open_questions".*\n/, "")).toBe(v3);
  });

  it("[R-KB-14] revise/v2 lists the open questions and the resolves rule only when the page has some", () => {
    const vars = { title: "T", existing: "1. a", incoming: "1. b" };
    const without = renderPrompt(loadPrompt("revise", "v2").template, { ...vars, questions: "" });
    const withQ = renderPrompt(loadPrompt("revise", "v2").template, { ...vars, questions: "1. Pourquoi ?" });
    expect(without).not.toContain("resolves");
    expect(without).not.toContain("Open questions of the page");
    expect(withQ).toContain('"resolves"');
    expect(withQ).toContain("Open questions of the page:\n1. Pourquoi ?");
    expect(without).toContain("report only real disagreements");
    // The v1 wording is untouched for pages without questions.
    expect(lf(without).trimEnd()).toBe(lf(renderPrompt(loadPrompt("revise", "v1").template, vars)).trimEnd());
  });

  it("cards/v3 with a request asks for that many, a second angle, no invention, fewer when needed; the default wording is gone", () => {
    const rendered = renderPrompt(loadPrompt("cards").template, { claims: "1. x", ...requestPromptVars(10) });
    expect(rendered).toContain("an array of 1 to 10 cards");
    expect(rendered).toContain("The user asked for 10 cards");
    expect(rendered).toContain("SECOND card");
    expect(rendered).toContain("DIFFERENT angle");
    expect(rendered).toContain("invent no facts");
    expect(rendered).toContain("fewer good cards beat many weak ones");
    expect(rendered).not.toContain("never more than 8");
    expect(rendered).not.toContain("1 to 8 cards");
    expect(rendered).not.toContain("{{");
  });

  it("enrich/v3 and claims/v3 with a request ask for about half to as many claims", () => {
    const enrich = renderPrompt(loadPrompt("enrich").template, { text: "t", ...requestPromptVars(10) });
    expect(enrich).toContain('"claims": 5 to 10 claims');
    expect(enrich).toContain("asks for 10 flashcards");
    expect(enrich).toContain("Never invent a fact");
    const claims = renderPrompt(loadPrompt("claims").template, { text: "t", instruction: "", ...requestPromptVars(9) });
    expect(claims).toContain('"claims": 5 to 9 claims');
    expect(claims).toContain("The user asked for 9 flashcards");
    expect(claims).not.toContain("Take 3 to 6");
  });

  it("a request below 8 keeps the default claim range and still names the count", () => {
    expect(requestPromptVars(3)).toEqual({ requested: "3", claimsRange: "" });
    const enrich = renderPrompt(loadPrompt("enrich").template, { text: "t", ...requestPromptVars(3) });
    expect(enrich).toContain('"claims": 4 to 8 claims');
    expect(enrich).toContain("asks for 3 flashcards");
  });
});
