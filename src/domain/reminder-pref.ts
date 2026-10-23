/** Reminder pause and unsubscribe (R-NOT-04, D53). Pure. */
export const REMINDER_CHOICES = ["on", "week", "month", "off"] as const;
export type ReminderChoice = (typeof REMINDER_CHOICES)[number];

export interface ReminderPref {
  reminders_off: boolean;
  reminders_paused_until: string | null;
}

export const isReminderChoice = (v: unknown): v is ReminderChoice => typeof v === "string" && (REMINDER_CHOICES as readonly string[]).includes(v);

/** The profile columns a choice sets. A pause is counted from the moment it is chosen. */
export function prefFor(choice: ReminderChoice, now: Date): ReminderPref {
  const days = choice === "week" ? 7 : choice === "month" ? 30 : 0;
  return {
    reminders_off: choice === "off",
    reminders_paused_until: days ? new Date(now.getTime() + days * 86_400_000).toISOString() : null,
  };
}

/** Whether a reminder may be sent now. */
export const remindersAllowed = (p: ReminderPref, now: Date) => !p.reminders_off && !(p.reminders_paused_until && new Date(p.reminders_paused_until) > now);

/** The choice the settings form shows as selected. */
export function currentChoice(p: ReminderPref, now: Date): ReminderChoice {
  if (p.reminders_off) return "off";
  if (p.reminders_paused_until && new Date(p.reminders_paused_until) > now) return new Date(p.reminders_paused_until).getTime() - now.getTime() > 8 * 86_400_000 ? "month" : "week";
  return "on";
}

/**
 * What saving the settings form changes for reminders: nothing when the chosen option is the one already in force,
 * so saving other settings never renews a running pause (D58).
 */
export function reminderUpdate(choice: ReminderChoice, current: ReminderChoice, now: Date): ReminderPref | null {
  return choice === current ? null : prefFor(choice, now);
}
