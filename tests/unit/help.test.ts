import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { HELP_CONSTANT_NUMBERS, HELP_LABEL_KEYS, buildHelpArgs, type HelpFacts } from "@/domain/help";
import { firstRunSteps, showFirstRun, tryMailto } from "@/domain/onboarding";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const LANGS = { fr, en } as const;
const facts: HelpFacts = { address: "add@example.test", accountEmail: "me@example.test", reminderTime: "18:00:00", dailyMinutes: 10, tokenHours: 24 };

type Tree = { [k: string]: string | Tree };
const get = (tree: Tree, path: string): string => path.split(".").reduce<string | Tree>((n, k) => (n as Tree)[k]!, tree) as string;
const leaves = (tree: Tree, prefix = ""): string[] => Object.entries(tree).flatMap(([k, v]) => (typeof v === "string" ? [prefix + k] : leaves(v, `${prefix}${k}.`)));

function labelsFor(lang: "fr" | "en") {
  const m = LANGS[lang] as unknown as Tree;
  return Object.fromEntries(Object.entries(HELP_LABEL_KEYS).map(([arg, key]) => [arg, get(m, key)])) as Record<keyof typeof HELP_LABEL_KEYS, string>;
}

describe("[R-ONB-03] the tutorial cannot drift from the screens", () => {
  for (const lang of ["fr", "en"] as const) {
    const help = (LANGS[lang] as unknown as Tree).help as Tree;
    const args = buildHelpArgs(labelsFor(lang), facts);

    it(`every ${lang} help message renders with its arguments, none missing`, () => {
      const t = createTranslator({ locale: lang, messages: { help }, namespace: "help", onError: (e) => { throw e; } });
      for (const key of leaves(help)) expect(() => (t as unknown as (k: string, a: Record<string, string | number>) => string)(key, args)).not.toThrow();
    });
    it(`${lang} help strings hold no UI label as text`, () => {
      const raw = leaves(help).map((k) => get(help, k)).join("\n");
      for (const [arg, label] of Object.entries(labelsFor(lang))) expect([arg, raw.includes(label)]).toEqual([arg, false]);
    });
    it(`${lang} help strings hold no address, time or limit as text`, () => {
      const raw = leaves(help).map((k) => get(help, k)).join("\n");
      expect(raw).not.toMatch(/@/);
      for (const n of HELP_CONSTANT_NUMBERS("18:00:00", 24)) expect([n, new RegExp("(?<![0-9a-zA-Z:])" + n + "(?![0-9a-zA-Z:])").test(raw)]).toEqual([n, false]);
    });
  }
  it("fr and en have the same help keys", () => {
    expect(leaves((fr as unknown as Tree).help as Tree).sort()).toEqual(leaves((en as unknown as Tree).help as Tree).sort());
  });
  it("the arguments carry the real constants and the user's own values", () => {
    const a = buildHelpArgs(labelsFor("fr"), facts);
    expect(a).toMatchObject({ maxItems: 4, maxFileMb: 25, maxPhotoMb: 15, reminderTime: "18:00", budget: 10, presets: "3, 6, 10, 15, 20", tokenHours: 24, address: "add@example.test" });
  });
});

describe("first-run card", () => {
  it("[R-ONB-02] ticks come from the data", () => {
    expect(firstRunSteps({ captures: 0, keptCards: 0, reviews: 0 })).toEqual({ capture: false, keep: false, review: false });
    expect(firstRunSteps({ captures: 2, keptCards: 1, reviews: 0 })).toEqual({ capture: true, keep: true, review: false });
  });
  it("[R-ONB-02] shown while a step is open, gone when done or hidden", () => {
    const open = { capture: true, keep: false, review: false };
    expect(showFirstRun(open, null)).toBe(true);
    expect(showFirstRun(open, "2026-10-16T10:00:00Z")).toBe(false);
    expect(showFirstRun({ capture: true, keep: true, review: true }, null)).toBe(false);
  });
  it("[R-ONB-04] the sample mailto holds the address, subject and note, encoded, and nothing else", () => {
    const href = tryMailto("add@example.test", "Ma première note", "Les abeilles & le nectar ?");
    expect(href).toBe("mailto:add@example.test?subject=Ma%20premi%C3%A8re%20note&body=Les%20abeilles%20%26%20le%20nectar%20%3F");
    expect(new URL(href).searchParams.get("body")).toBe("Les abeilles & le nectar ?");
  });
});
