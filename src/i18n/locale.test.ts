import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pickLocale } from "./locale";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}
const load = (l: string) => JSON.parse(readFileSync(`messages/${l}.json`, "utf8")) as Record<string, unknown>;

describe("i18n", () => {
  it("[R-ACC-03] French is the default language", () => {
    expect(pickLocale(undefined)).toBe("fr");
    expect(pickLocale("de")).toBe("fr");
  });
  it("[R-ACC-03] English is available through the user's choice", () => {
    expect(pickLocale("en")).toBe("en");
  });
  it("[R-ACC-03] fr.json and en.json define exactly the same keys", () => {
    expect(keys(load("en")).sort()).toEqual(keys(load("fr")).sort());
  });
});
