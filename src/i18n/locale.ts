export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "fr" || value === "en";
}

/** The user's choice (cookie, later their saved setting), else French (R-ACC-03). The browser language is ignored. */
export function pickLocale(cookie: string | undefined): Locale {
  return isLocale(cookie) ? cookie : DEFAULT_LOCALE;
}
