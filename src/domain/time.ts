/** Local-day arithmetic from an IANA timezone (R-ACC-04, R-NOT-02). Pure: uses only Intl. */

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function localParts(at: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAYS[get("weekday")]!,
  };
}

/** "YYYY-MM-DD" of the user's local date. */
export function localDate(at: Date, timeZone: string): string {
  const p = localParts(at, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** The UTC instant at which the user's current local day started. */
export function localDayStart(at: Date, timeZone: string): Date {
  const p = localParts(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const offsetMs = asUtc - Math.floor(at.getTime() / 60_000) * 60_000;
  const midnightUtcGuess = Date.UTC(p.year, p.month - 1, p.day) - offsetMs;
  // Re-evaluate the offset at the guessed instant, in case a DST change falls between midnight and now.
  const q = localParts(new Date(midnightUtcGuess), timeZone);
  const drift = Date.UTC(q.year, q.month - 1, q.day, q.hour, q.minute) - Date.UTC(p.year, p.month - 1, p.day);
  return new Date(midnightUtcGuess - drift);
}

/** True when `at` is on one of the user's study days (0 = Sunday). */
export function isStudyDay(at: Date, timeZone: string, studyDays: readonly number[]): boolean {
  return studyDays.includes(localParts(at, timeZone).weekday);
}
