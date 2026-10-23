import { describe, expect, it } from "vitest";
import { questionDefects } from "./questions";

describe("open-question checks", () => {
  it("[R-KB-14] accepts a plain question and flags the obvious defects", () => {
    expect(questionDefects("Pourquoi Teotihuacan a-t-elle été abandonnée ?")).toEqual([]);
    expect(questionDefects("Teotihuacan a été abandonnée.")).toEqual(["no question mark"]);
    expect(questionDefects("Quelles sources l'auteur a-t-il utilisées ?")).toEqual(["about the document or its author"]);
    expect(questionDefects("Why does the article ignore it?")).toEqual(["about the document or its author"]);
    expect(questionDefects(`${"x".repeat(201)} ?`)).toEqual(["longer than 200 characters"]);
  });
});
