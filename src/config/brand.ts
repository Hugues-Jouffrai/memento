/**
 * R-OPS-03: the product name lives here and only here (D49). Renaming the product means editing `name` and adding
 * the old name to `previousNames`; tests/unit/brand.test.ts then fails on any leftover. Sender, capture domain and app
 * URL are per-deployment env, read by src/server/config.ts.
 */
export const BRAND = {
  name: "Memento",
  previousNames: ["LeitnerBox"],
} as const;

const PLACEHOLDER = /\{brand\}/g;

/**
 * Fills the `{brand}` placeholder in every message before the messages reach next-intl (next-intl 4 has no
 * global default values). Returns a copy with the same shape.
 */
export function withBrand<T>(messages: T, name: string = BRAND.name): T {
  if (typeof messages === "string") return messages.replace(PLACEHOLDER, name) as T;
  if (Array.isArray(messages)) return messages.map((m) => withBrand(m, name)) as T;
  if (messages && typeof messages === "object") {
    return Object.fromEntries(Object.entries(messages).map(([k, v]) => [k, withBrand(v, name)])) as T;
  }
  return messages;
}
