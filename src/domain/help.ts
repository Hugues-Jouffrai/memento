/**
 * The tutorial cannot drift from the screens (R-ONB-03): `help` messages never hold a UI label, an address, a time or
 * a limit as text. They receive all of them as ICU arguments, built here from the screens' own labels, the code
 * constants and the user's profile.
 */
import { MAX_ATTACHMENT_BYTES, MAX_VISION_BYTES } from "./attachments";
import { MAX_ITEMS_PER_MAIL } from "./items";
import { DAILY_MINUTES } from "./settings";

/** Labels the tutorial quotes, by argument name, filled from the other screens' own message keys. */
export const HELP_LABEL_KEYS = {
  tray: "nav.tray",
  review: "nav.review",
  pages: "nav.pages",
  settings: "nav.settings",
  keep: "tray.keep",
  discard: "tray.discard",
  keepAll: "tray.keepAll",
  badgeModel: "tray.badgeModel",
  show: "review.show",
  again: "review.again",
  hard: "review.hard",
  good: "review.good",
  easy: "review.easy",
  continueAnyway: "review.continueAnyway",
  edit: "review.edit",
  suspend: "review.suspend",
} as const;

export interface HelpFacts {
  address: string;
  accountEmail: string;
  reminderTime: string;
  dailyMinutes: number;
  tokenHours: number;
}

const MB = 1024 * 1024;

export function buildHelpArgs(labels: Record<keyof typeof HELP_LABEL_KEYS, string>, facts: HelpFacts): Record<string, string | number> {
  return {
    ...labels,
    address: facts.address,
    accountEmail: facts.accountEmail,
    maxItems: MAX_ITEMS_PER_MAIL,
    maxFileMb: Math.round(MAX_ATTACHMENT_BYTES / MB),
    maxPhotoMb: Math.round(MAX_VISION_BYTES / MB),
    reminderTime: facts.reminderTime.slice(0, 5),
    budget: facts.dailyMinutes,
    presets: DAILY_MINUTES.join(", "),
    tokenHours: facts.tokenHours,
  };
}

/** The numbers the tutorial must receive as arguments, never write itself. */
export const HELP_CONSTANT_NUMBERS = (reminderTime: string, tokenHours: number): string[] => [
  String(MAX_ITEMS_PER_MAIL),
  String(Math.round(MAX_ATTACHMENT_BYTES / MB)),
  String(Math.round(MAX_VISION_BYTES / MB)),
  reminderTime.slice(0, 5),
  String(tokenHours),
  ...DAILY_MINUTES.map(String),
];
