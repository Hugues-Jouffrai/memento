/** Pure rules of the universal invite link (R-ACC-02, D52): code shape, defaults, rate limits. No I/O. */

/** The link carries 160 random bits, base64url (27 characters). Only its SHA-256 is stored. */
export const INVITE_CODE_BYTES = 20;
export const INVITE_CODE_RE = /^[A-Za-z0-9_-]{27}$/;
export const DEFAULT_INVITE_MAX_USES = 30;
export const DEFAULT_INVITE_DAYS = 30;

/** Requests per hour from one address and from one network address (hashed before they are stored). */
export const JOIN_LIMIT_PER_EMAIL = 5;
export const JOIN_LIMIT_PER_IP = 20;
export const JOIN_WINDOW_SECONDS = 3600;

export const isInviteCode = (raw: unknown): raw is string => typeof raw === "string" && INVITE_CODE_RE.test(raw);

export function inviteExpiry(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 86_400_000);
}

export interface InviteInput {
  maxUses: number;
  days: number;
}

/** Reads `--max` and `--days` from the script's arguments; refuses anything but positive whole numbers. */
export function parseInviteArgs(args: readonly string[]): { ok: true; value: InviteInput; label: string | null } | { ok: false; error: string } {
  let maxUses = DEFAULT_INVITE_MAX_USES;
  let days = DEFAULT_INVITE_DAYS;
  let label: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const val = args[i + 1];
    if (flag === "--max" || flag === "--days") {
      if (val === undefined || !/^\d{1,4}$/.test(val) || Number(val) < 1) return { ok: false, error: `${flag} needs a whole number between 1 and 9999` };
      if (flag === "--max") maxUses = Number(val);
      else days = Number(val);
      i++;
    } else if (flag === "--label") {
      if (!val?.trim()) return { ok: false, error: "--label needs a name" };
      label = val.trim().slice(0, 60);
      i++;
    } else return { ok: false, error: `unknown argument ${flag}` };
  }
  return { ok: true, value: { maxUses, days }, label };
}
