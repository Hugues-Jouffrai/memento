import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE, isStyle, pickStyle, STYLES, THEME_COLORS, type Style } from "./style";
import { keepFrenchSpaces } from "./typography";

const css = readFileSync("app/globals.css", "utf8");
const DARK = "@media (prefers-color-scheme: dark)";

/** `--name: #hex` pairs of one CSS block body. */
function tokensOf(body: string): Record<string, string> {
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/g)].map((m) => [m[1]!, m[2]!]));
}

/** The shared `:root` tokens (the neutral base), then each style's own `:root[data-style=…]` block, light and dark. */
function tokens(style: Style, scheme: "light" | "dark"): Record<string, string> {
  const darkAt = css.indexOf(DARK);
  const base = scheme === "light" ? css.slice(css.indexOf(":root {"), darkAt) : css.slice(darkAt, css.indexOf("}", css.indexOf(":root {", darkAt)));
  const own = [...css.matchAll(new RegExp(`(${DARK.replace(/[()]/g, "\\$&")} \\{\\s*)?:root\\[data-style="${style}"\\] \\{([^}]*)\\}`, "g"))];
  const block = own.find((m) => (scheme === "dark") === Boolean(m[1]));
  return { ...tokensOf(base), ...(block ? tokensOf(block[2]!) : {}) };
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function ratio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("look and feel", () => {
  it("[R-UI-01] signal is the default style; an unknown cookie falls back to it", () => {
    expect(DEFAULT_STYLE).toBe("signal");
    expect(pickStyle(undefined)).toBe("signal");
    expect(pickStyle("")).toBe("signal");
    expect(pickStyle("neon")).toBe("signal");
  });

  it("[R-UI-01] each of the four styles is accepted, in the order the settings screen offers them", () => {
    expect(STYLES).toEqual(["signal", "revue", "calme", "recre"]);
    for (const s of STYLES) {
      expect(isStyle(s)).toBe(true);
      expect(pickStyle(s)).toBe(s);
    }
  });

  it("[R-UI-01] every style has its own block in the stylesheet, a label in both languages and a browser bar colour", () => {
    const fr = JSON.parse(readFileSync("messages/fr.json", "utf8")).style;
    const en = JSON.parse(readFileSync("messages/en.json", "utf8")).style;
    for (const s of STYLES) {
      expect(css).toContain(`[data-style="${s}"]`);
      expect(fr[s], `fr label for ${s}`).toBeTruthy();
      expect(en[s], `en label for ${s}`).toBeTruthy();
      expect(THEME_COLORS[s].light).toBe(tokens(s, "light").paper);
      expect(THEME_COLORS[s].dark).toBe(tokens(s, "dark").paper);
    }
  });

  it("[R-UI-01] every self-hosted font file exists and ships with its OFL licence", () => {
    const files = [...css.matchAll(/url\("\/fonts\/([^"]+)"\)/g)].map((m) => m[1]!);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(existsSync(`public/fonts/${f}`), f).toBe(true);
    for (const family of ["newsreader", "schibsted-grotesk", "archivo", "ibm-plex-mono", "atkinson-hyperlegible-next", "atkinson-hyperlegible-mono", "lexend"]) {
      expect(readFileSync(`public/fonts/OFL-${family}.txt`, "utf8")).toContain("SIL Open Font License, Version 1.1");
    }
  });

  it("[R-UI-02] tap targets are at least 44px and focus is visible", () => {
    expect(css).toMatch(/--tap:\s*2\.75rem/); // 44px at the 16px root size
    expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*3px solid/);
    expect(css).not.toMatch(/outline:\s*(none|0)\s*[;}](?![^{]*box-shadow)/); // never removed without a replacement
  });

  it("[R-UI-02] every ink colour has a contrast of at least 4.5:1 on paper, desk and grid, in every style, light and dark", () => {
    for (const s of STYLES) {
      for (const scheme of ["light", "dark"] as const) {
        const t = tokens(s, scheme);
        for (const ink of ["ink", "ink-2", "red", "blue"]) {
          for (const bg of ["paper", "desk", "grid"]) {
            expect(ratio(t[ink]!, t[bg]!), `${s} ${scheme}: ${ink} on ${bg}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });

  it("[R-UI-02] text on a filled block (grade blocks, primary buttons, highlighted excerpts) has a contrast of at least 4.5:1", () => {
    let pairs = 0;
    for (const s of STYLES) {
      for (const scheme of ["light", "dark"] as const) {
        const t = tokens(s, scheme);
        for (const [name, fg] of Object.entries(t)) {
          const bg = name.startsWith("on-") ? t[name.slice(3)] : undefined;
          if (!bg) continue;
          pairs++;
          expect(ratio(fg, bg), `${s} ${scheme}: ${name} on ${name.slice(3)}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
    expect(pairs).toBeGreaterThanOrEqual(2 * (4 + 1 + 1 + 1)); // signal: 4 grades + ink; revue: ink + highlight
  });

  it("[R-ABOUT-07] the About role pairs (theory blue, algorithm orange, memento yellow) exist in every style and read at 4.5:1", () => {
    for (const s of STYLES) {
      for (const scheme of ["light", "dark"] as const) {
        const t = tokens(s, scheme);
        for (const role of ["theory", "algorithm", "memento"]) {
          expect(t[`role-${role}`], `${s} ${scheme}: role-${role}`).toBeTruthy();
          expect(ratio(t[`on-role-${role}`]!, t[`role-${role}`]!), `${s} ${scheme}: on-role-${role}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("[R-ABOUT-07] the role colours are the signal grade colours (blue good, orange again, yellow hard)", () => {
    for (const scheme of ["light", "dark"] as const) {
      const t = tokens("signal", scheme);
      expect([t["role-theory"], t["role-algorithm"], t["role-memento"]]).toEqual([t.good, t.again, t.hard]);
      expect([t["on-role-theory"], t["on-role-algorithm"], t["on-role-memento"]]).toEqual([t["on-good"], t["on-again"], t["on-hard"]]);
    }
  });

  it("[R-UI-01] French punctuation keeps its space without breaking the line", () => {
    expect(keepFrenchSpaces("« Le lieu » ?")).toBe("« Le lieu » ?");
    expect(keepFrenchSpaces("Pour rappel : oui ; non !")).toBe("Pour rappel : oui ; non !");
    expect(keepFrenchSpaces("What? https://a.b/c:d")).toBe("What? https://a.b/c:d");
  });
});
