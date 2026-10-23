import { isValidTimezone } from "./time";

type Locale = "fr" | "en";

/** R-ACC-05: the allowed daily budgets, in minutes. */
export const DAILY_MINUTES = [3, 6, 10, 15, 20] as const;
export const MAX_NEW_CARDS_LIMIT = 20;
/** R-ACC-06 */
export const RETENTION_MIN = 0.8;
export const RETENTION_MAX = 0.95;
/** The profile default (migration m1: `desired_retention` default 0.90). The About page quotes it (R-ABOUT-03). */
export const DEFAULT_RETENTION = 0.9;

export interface Settings {
  daily_minutes: number;
  study_days: number[];
  max_new_cards: number;
  desired_retention: number;
  timezone: string;
  language: Locale;
}

export type SettingsField = "daily_minutes" | "study_days" | "max_new_cards" | "desired_retention" | "timezone" | "language";

export type SettingsResult = { ok: true; value: Settings } | { ok: false; errors: SettingsField[] };

type Raw = Partial<Record<SettingsField, unknown>>;

const asInt = (v: unknown): number | null => {
  if (typeof v !== "string" || !/^\d{1,3}$/.test(v.trim())) return null;
  return Number(v.trim());
};

/** Server-side validation of the settings form (R-ACC-05, R-ACC-06). Anything out of range is rejected, never clamped. */
export function validateSettings(raw: Raw): SettingsResult {
  const errors: SettingsField[] = [];

  const minutes = asInt(raw.daily_minutes);
  if (minutes === null || !(DAILY_MINUTES as readonly number[]).includes(minutes)) errors.push("daily_minutes");

  const days = Array.isArray(raw.study_days) ? raw.study_days.map((d) => (typeof d === "string" && /^[0-6]$/.test(d) ? Number(d) : Number.NaN)) : [];
  const uniqueDays = [...new Set(days)].sort((a, b) => a - b);
  if (days.length === 0 || days.some(Number.isNaN)) errors.push("study_days");

  const maxNew = asInt(raw.max_new_cards);
  if (maxNew === null || maxNew > MAX_NEW_CARDS_LIMIT) errors.push("max_new_cards");

  const retentionText = typeof raw.desired_retention === "string" ? raw.desired_retention.trim().replace(",", ".") : "";
  const retention = /^\d(\.\d{1,2})?$/.test(retentionText) ? Number(retentionText) : Number.NaN;
  if (!(retention >= RETENTION_MIN - 1e-9 && retention <= RETENTION_MAX + 1e-9)) errors.push("desired_retention");

  const tz = typeof raw.timezone === "string" ? raw.timezone.trim() : "";
  if (!tz || tz.length > 64 || !isValidTimezone(tz)) errors.push("timezone");

  const language = typeof raw.language === "string" ? raw.language : "";
  if (language !== "fr" && language !== "en") errors.push("language");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      daily_minutes: minutes!,
      study_days: uniqueDays,
      max_new_cards: maxNew!,
      desired_retention: Math.round(retention * 100) / 100,
      timezone: tz,
      language: language as Locale,
    },
  };
}
