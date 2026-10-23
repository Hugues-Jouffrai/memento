import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { isLocale, type Locale } from "@/i18n/locale";
import { parseEmail } from "./auth";

/**
 * D54 / R-LAND-04, R-LAND-07: tokens for the notify-me list. AES-256-GCM, so the address is never readable in a URL,
 * a request log or a referrer, and nothing needs storing before the owner confirms. The key is derived from
 * REVIEW_LINK_SECRET with its own label; the purpose is authenticated data, so a leave token never opens as a confirm one.
 */
export type WaitlistPurpose = "confirm" | "leave";
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const keyFrom = (secret: string) => createHash("sha256").update(`waitlist-token-v1\u0000${secret}`).digest();
const nowSec = () => Math.floor(Date.now() / 1000);

export function sealWaitlistToken(purpose: WaitlistPurpose, email: string, locale: Locale, secret: string | undefined, ttlSeconds: number, now = nowSec()): string {
  if (!secret) throw new Error("REVIEW_LINK_SECRET is not set");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  cipher.setAAD(Buffer.from(purpose));
  const body = Buffer.concat([cipher.update(JSON.stringify({ e: email, l: locale, x: now + ttlSeconds }), "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, body, cipher.getAuthTag()]).toString("base64url");
}

/** The address and language, or null for anything expired, tampered, of another purpose, or when the secret is unset. */
export function openWaitlistToken(purpose: WaitlistPurpose, token: unknown, secret: string | undefined, now = nowSec()): { email: string; locale: Locale } | null {
  if (!secret || typeof token !== "string" || token.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const raw = Buffer.from(token, "base64url");
  if (raw.length < 1 + IV_BYTES + TAG_BYTES + 2 || raw[0] !== VERSION) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), raw.subarray(1, 1 + IV_BYTES));
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
    const plain = Buffer.concat([decipher.update(raw.subarray(1 + IV_BYTES, raw.length - TAG_BYTES)), decipher.final()]).toString("utf8");
    const p = JSON.parse(plain) as { e?: unknown; l?: unknown; x?: unknown };
    const email = parseEmail(p.e);
    if (!email || typeof p.l !== "string" || !isLocale(p.l) || typeof p.x !== "number" || p.x < now) return null;
    return { email, locale: p.l };
  } catch {
    return null;
  }
}
