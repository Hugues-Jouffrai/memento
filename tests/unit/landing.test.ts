import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { withBrand } from "@/config/brand";
import { HELP_LABEL_KEYS } from "@/domain/help";
import { WAITLIST_RETENTION_MONTHS } from "@/domain/waitlist";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

const LANGS = { fr, en } as const;
type Tree = { [k: string]: string | Tree };
const tree = (lang: "fr" | "en"): Tree => LANGS[lang] as unknown as Tree;
const get = (t: Tree, path: string): string => path.split(".").reduce<string | Tree>((n, k) => (n as Tree)[k]!, t) as string;
const leaves = (t: Tree, prefix = ""): string[] => Object.entries(t).flatMap(([k, v]) => (typeof v === "string" ? [prefix + k] : leaves(v, `${prefix}${k}.`)));
const section = (lang: "fr" | "en", path: string) => get(tree(lang), path) as unknown as Tree;

describe("[R-LAND-02] landing strings", () => {
  for (const ns of ["landing", "waitlist", "email.waitlist"]) {
    it(`${ns} has the same keys in fr and en`, () => {
      expect(leaves(section("fr", ns)).sort()).toEqual(leaves(section("en", ns)).sort());
    });
  }

  for (const lang of ["fr", "en"] as const) {
    it(`${lang}: no landing string quotes a UI label, a digit or an address`, () => {
      const landing = section(lang, "landing");
      const raw = leaves(landing).map((k) => get(landing, k));
      for (const [arg, key] of Object.entries(HELP_LABEL_KEYS)) {
        const label = get(tree(lang), key);
        for (const s of raw) expect([arg, s.includes(label)]).toEqual([arg, false]);
      }
      for (const s of raw) {
        expect(s).not.toMatch(/\d/);
        expect(s).not.toContain("@");
      }
    });

    it(`${lang}: every landing and waitlist string renders`, () => {
      const messages = withBrand({ landing: tree(lang).landing, waitlist: tree(lang).waitlist });
      const t = createTranslator({ locale: lang, messages, onError: (e) => { throw e; } }) as unknown as {
        (k: string, a?: Record<string, string>): string;
        rich(k: string, a: Record<string, unknown>): unknown;
      };
      for (const ns of ["landing", "waitlist"] as const) {
        for (const key of leaves(messages[ns] as unknown as Tree)) {
          const full = `${ns}.${key}`;
          if (full === "landing.notify.consent") expect(() => t.rich(full, { link: (c: unknown) => c })).not.toThrow();
          else expect(() => t(full, { email: "a@example.test" })).not.toThrow();
        }
      }
    });
  }
});

describe("[R-LAND-09] retention", () => {
  it("the migration interval equals the code constant", () => {
    const sql = readFileSync("supabase/migrations/20261016180000_waitlist.sql", "utf8");
    expect(sql).toContain(`interval '${WAITLIST_RETENTION_MONTHS} months'`);
  });

  for (const lang of ["fr", "en"] as const) {
    it(`${lang}: the privacy strings take the number and the leave link as arguments, with no digit`, () => {
      const p = section(lang, "privacy");
      expect(p.waitlist).toContain("{months}");
      expect(p.waitlist).not.toMatch(/\d/);
      expect(p.waitlistRemove).toContain("{leaveLink}");
    });
  }
});

describe("[R-LAND-01] proxy", () => {
  it("lets the landing page and the notify paths through", () => {
    const src = readFileSync("proxy.ts", "utf8");
    expect(src).toMatch(/PUBLIC = \[[^\]]*"\/notify\/"/);
    expect(src).toContain('path === "/"');
  });
});
