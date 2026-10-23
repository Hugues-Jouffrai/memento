import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const png = (f: string) => {
  const b = readFileSync(f);
  expect(b.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: b[25] === 6 };
};

describe("tab icons", () => {
  it("icon.png is a square PNG with transparency", () => {
    const i = png("app/icon.png");
    expect(i.w).toBe(i.h);
    expect(i.alpha).toBe(true);
  });
  it("apple-icon.png is a 180 px square", () => {
    expect(png("app/apple-icon.png")).toMatchObject({ w: 180, h: 180 });
  });
  it("favicon.ico holds the 16, 32 and 48 px images", () => {
    const b = readFileSync("app/favicon.ico");
    expect(b.readUInt16LE(2)).toBe(1);
    const n = b.readUInt16LE(4);
    expect(Array.from({ length: n }, (_, k) => b[6 + 16 * k])).toEqual([16, 32, 48]);
  });
  it("[R-UI-04] the logo is a vector: logo.svg has no background, icon.svg sits on the site's paper colour, light and dark", () => {
    const logo = readFileSync("public/logo.svg", "utf8");
    expect(logo).toMatch(/^<svg[^>]*viewBox=/);
    expect(logo).not.toMatch(/<rect|<image/);
    const icon = readFileSync("app/icon.svg", "utf8");
    expect(icon).toContain(".bg{fill:#f4f3ef}");
    expect(icon).toContain("prefers-color-scheme:dark");
    expect(icon).toContain(".bg{fill:#111110}");
  });
});
