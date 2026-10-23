import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { HELP_LABEL_KEYS } from "@/domain/help";
import { needsWelcome, parseWelcomeStep, welcomeNav, WELCOME_STEPS } from "@/domain/welcome";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

type Tree = { [k: string]: string | Tree };
const LANGS = { fr, en } as unknown as Record<"fr" | "en", Tree>;
const get = (tree: Tree, path: string): string => path.split(".").reduce<string | Tree>((n, k) => (n as Tree)[k]!, tree) as string;
const keys = (tree: Tree): string[] => Object.keys(tree).sort();

describe("[R-ONB-08] walkthrough steps", () => {
  it("accepts 1 to 5 and nothing else", () => {
    for (let i = 1; i <= WELCOME_STEPS; i++) expect(parseWelcomeStep(String(i))).toBe(i);
    for (const bad of ["0", "6", "-1", "01", "1.5", "x", "", " 1", "1 ", "1e1", "99999999999999999999"]) expect(parseWelcomeStep(bad)).toBeNull();
  });
  it("has Back from step 2 and Next until step 5", () => {
    expect(welcomeNav(1)).toEqual({ prev: null, next: 2 });
    expect(welcomeNav(3)).toEqual({ prev: 2, next: 4 });
    expect(welcomeNav(WELCOME_STEPS)).toEqual({ prev: WELCOME_STEPS - 1, next: null });
  });
});

describe("[R-ONB-07] when `/` offers the walkthrough", () => {
  it("only while the account has not skipped or finished it", () => {
    expect(needsWelcome(null)).toBe(true);
    expect(needsWelcome(undefined)).toBe(true);
    expect(needsWelcome("2026-10-16T10:00:00Z")).toBe(false);
  });
});

describe("[R-ONB-10] the walkthrough's own messages", () => {
  const frW = LANGS.fr.welcome as Tree;
  const enW = LANGS.en.welcome as Tree;

  it("have the same keys in fr and en, and one title per step", () => {
    expect(keys(frW)).toEqual(keys(enW));
    for (let i = 1; i <= WELCOME_STEPS; i++) expect(frW[`title${i}`]).toBeTruthy();
  });

  for (const lang of ["fr", "en"] as const) {
    const w = LANGS[lang].welcome as Tree;
    it(`${lang}: every message renders`, () => {
      const t = createTranslator({ locale: lang, messages: { welcome: w }, namespace: "welcome", onError: (e) => { throw e; } });
      for (const key of Object.keys(w)) expect(() => (t as unknown as (k: string, a: Record<string, number>) => string)(key, { step: 2, total: WELCOME_STEPS })).not.toThrow();
    });
    it(`${lang}: no UI label, digit or address is written as text`, () => {
      const labels = Object.values(HELP_LABEL_KEYS).map((k) => get(LANGS[lang], k));
      for (const [key, value] of Object.entries(w) as [string, string][]) {
        for (const label of labels) expect(value.includes(label), `${key} contains the label "${label}"`).toBe(false);
        expect(/\d/.test(value), `${key} contains a digit`).toBe(false);
        expect(value.includes("@"), `${key} contains @`).toBe(false);
      }
    });
  }
});
