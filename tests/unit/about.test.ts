import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { ABOUT_SOURCES, VERIFIED_SOURCES } from "@/config/about-sources";
import { BRAND, withBrand } from "@/config/brand";
import { ABOUT_ROLES, ABOUT_SECTIONS } from "@/domain/about";
import { DEFAULT_RETENTION } from "@/domain/settings";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const LANGS = { fr, en } as const;
type Tree = { [k: string]: string | Tree };
const tree = (lang: "fr" | "en"): Tree => LANGS[lang] as unknown as Tree;
const get = (t: Tree, path: string): string => path.split(".").reduce<string | Tree>((n, k) => (n as Tree)[k]!, t) as string;
const leaves = (t: Tree, prefix = ""): string[] => Object.entries(t).flatMap(([k, v]) => (typeof v === "string" ? [prefix + k] : leaves(v, `${prefix}${k}.`)));
const about = (lang: "fr" | "en") => tree(lang).about as Tree;

/** The ICU arguments the page passes: grade labels from the review messages, the default retention from the code constant. */
function args(lang: "fr" | "en") {
  const review = tree(lang).review as Tree;
  return { again: review.again as string, hard: review.hard as string, good: review.good as string, easy: review.easy as string, retention: Math.round(DEFAULT_RETENTION * 100) };
}

function render(lang: "fr" | "en"): Record<string, string> {
  const messages = withBrand({ about: about(lang) });
  const t = createTranslator({ locale: lang, messages, onError: (e) => { throw e; } }) as unknown as (k: string, a: Record<string, unknown>) => string;
  return Object.fromEntries(leaves(messages.about as unknown as Tree).map((k) => [k, t(`about.${k}`, args(lang))]));
}

describe("[R-ABOUT-01] public route", () => {
  it("/about is in the proxy's public list, next to /privacy", () => {
    expect(readFileSync("proxy.ts", "utf8")).toMatch(/PUBLIC = \[[^\]]*"\/privacy", "\/about"/);
  });

  it("the page is a server component with no data access or client code", () => {
    const src = readFileSync("app/about/page.tsx", "utf8");
    expect(src).not.toContain("use client");
    expect(src).not.toMatch(/sessionViewer|supabase|cookies\(/);
  });

  it("the six sections come in the design's order", () => {
    expect(ABOUT_SECTIONS.map((s) => s.id)).toEqual(["forgetting", "testing", "spacing", "fsrs", "cards", "budget"]);
  });
});

describe("[R-ABOUT-02] sources", () => {
  it("ids are unique and every id a section cites exists and is verified", () => {
    const ids = ABOUT_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of ABOUT_SECTIONS) {
      for (const id of s.sources) {
        const src = ABOUT_SOURCES.find((x) => x.id === id);
        expect(src, `${s.id} cites ${id}`).toBeDefined();
        expect(src!.status, `${id} is rendered, so it must be verified`).toBe("verified");
      }
    }
  });

  it("only verified entries render, and each has authors, a title and an https URL (a DOI link for papers)", () => {
    expect(VERIFIED_SOURCES.every((s) => s.status === "verified")).toBe(true);
    expect(VERIFIED_SOURCES.map((s) => s.id).sort()).toEqual(["dunlosky", "fsrs", "roediger", "tsfsrs", "wiki"]);
    for (const s of VERIFIED_SOURCES) {
      expect(s.authors).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(new URL(s.url).protocol).toBe("https:");
      if (s.year) expect(new URL(s.url).hostname).toBe("doi.org");
    }
    expect(VERIFIED_SOURCES.find((s) => s.id === "dunlosky")!.url).toBe("https://doi.org/10.1177/1529100612453266");
    expect(VERIFIED_SOURCES.find((s) => s.id === "roediger")!.url).toBe("https://doi.org/10.1111/j.1467-9280.2006.01693.x");
  });

  it("a to-verify entry never reaches the page", () => {
    const list = [...ABOUT_SOURCES, { ...ABOUT_SOURCES[0]!, id: "draft", status: "to-verify" as const }];
    expect(list.filter((s) => s.status === "verified").some((s) => s.id === "draft")).toBe(false);
  });
});

describe("[R-ABOUT-03] no number without a source", () => {
  it("the default retention is the profile default in the migration", () => {
    const sql = readFileSync("supabase/migrations/20261014103046_m1_accounts_capture_jobs.sql", "utf8");
    expect(sql).toMatch(/desired_retention numeric\(3, 2\) not null default 0\.90/);
    expect(DEFAULT_RETENTION).toBe(0.9);
  });

  for (const lang of ["fr", "en"] as const) {
    it(`${lang}: the about messages hold no digit; rendered, the only number is the default retention`, () => {
      const messages = about(lang);
      for (const k of leaves(messages)) expect(get(messages, k), k).not.toMatch(/\d/);
      const allowed = new Set([String(Math.round(DEFAULT_RETENTION * 100))]);
      for (const [k, text] of Object.entries(render(lang))) {
        for (const digits of text.match(/\d+/g) ?? []) expect(allowed.has(digits), `${k}: ${digits}`).toBe(true);
      }
    });
  }
});

describe("[R-ABOUT-04] D5: no benefit claim", () => {
  const DENY = ["moins de révisions", "plus précis", "plus efficace", "prouvé", "fewer reviews", "more accurate", "proven"];
  for (const lang of ["fr", "en"] as const) {
    it(`${lang}: no deny-listed phrase`, () => {
      const text = Object.values(render(lang)).join("\n").toLowerCase();
      for (const phrase of DENY) expect(text, phrase).not.toContain(phrase);
    });
  }
});

describe("[R-ABOUT-05] languages and brand", () => {
  it("fr and en have the same keys", () => {
    expect(leaves(about("fr")).sort()).toEqual(leaves(about("en")).sort());
  });

  for (const lang of ["fr", "en"] as const) {
    it(`${lang}: no old name, no hard-coded current name, grade labels only as arguments, every message renders`, () => {
      const m = about(lang);
      const raw = leaves(m).map((k) => get(m, k));
      for (const name of [...BRAND.previousNames, BRAND.name]) for (const s of raw) expect(s.toLowerCase()).not.toContain(name.toLowerCase());
      expect(raw.some((s) => s.includes("{brand}"))).toBe(true);
      const a = args(lang);
      for (const label of [a.again, a.hard, a.good, a.easy]) for (const s of raw) expect([label, s.includes(label)]).toEqual([label, false]);
      expect(get(m, "sections.fsrs.memento")).toContain("{again}");
      expect(get(m, "sections.fsrs.memento")).toContain("{retention}");
      expect(Object.keys(render(lang)).length).toBe(raw.length);
    });

    it(`${lang}: the brand fills in at render time`, () => {
      expect(render(lang)["lede"]).toContain(BRAND.name);
    });
  }
});

describe("[R-ABOUT-10] roles", () => {
  it("there are three roles, and every section and block declares one", () => {
    expect([...ABOUT_ROLES]).toEqual(["theory", "algorithm", "memento"]);
    for (const s of ABOUT_SECTIONS) {
      expect(ABOUT_ROLES, s.id).toContain(s.role);
      expect(s.blocks.length, s.id).toBeGreaterThan(0);
      expect(s.blocks, `${s.id}: main role is one of its blocks`).toContain(s.role);
      for (const b of s.blocks) expect(ABOUT_ROLES, `${s.id}/${b}`).toContain(b);
    }
  });

  for (const lang of ["fr", "en"] as const) {
    it(`${lang}: every role has a text label, and every block of every section has its text`, () => {
      const m = about(lang);
      for (const r of ABOUT_ROLES) expect(get(m, `roles.${r}`), r).toBeTruthy();
      expect(new Set(ABOUT_ROLES.map((r) => get(m, `roles.${r}`))).size).toBe(3);
      for (const s of ABOUT_SECTIONS) {
        expect(get(m, `sections.${s.id}.title`), s.id).toBeTruthy();
        for (const b of s.blocks) expect(get(m, `sections.${s.id}.${b}`), `${s.id}.${b}`).toBeTruthy();
      }
    });
  }

  it("the role labels are fixed words: theory, algorithm, and the brand", () => {
    expect(withBrand(about("fr")).roles).toEqual({ theory: "La théorie", algorithm: "L'algorithme", memento: `Dans ${BRAND.name}` });
  });
});
