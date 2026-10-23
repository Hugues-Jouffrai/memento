/** The app's looks, in the order the settings screen offers them (D48). */
export const STYLES = ["signal", "revue", "calme", "recre"] as const;
export type Style = (typeof STYLES)[number];
export const DEFAULT_STYLE: Style = "signal";
export const STYLE_COOKIE = "style";

/** Browser bar colour per style, light and dark: the page background (`--paper`) in app/globals.css. */
export const THEME_COLORS: Record<Style, { light: string; dark: string }> = {
  signal: { light: "#f4f3ef", dark: "#111110" },
  revue: { light: "#fbfaf8", dark: "#161513" },
  calme: { light: "#fafaf7", dark: "#141513" },
  recre: { light: "#ffffff", dark: "#1b1a21" },
};

export function isStyle(value: string | undefined | null): value is Style {
  return (STYLES as readonly string[]).includes(value ?? "");
}

/** The user's look (cookie for now, later a saved setting), else the default style. */
export function pickStyle(cookie: string | undefined): Style {
  return isStyle(cookie) ? cookie : DEFAULT_STYLE;
}
