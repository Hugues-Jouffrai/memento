import { createHmac, timingSafeEqual } from "node:crypto";

export interface SvixInput {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  /** The raw request body, exactly as received. */
  body: string;
  /** `whsec_...`. Empty or missing means every request is refused (R-SEC-02). */
  secret: string | undefined;
  nowSec?: number;
  toleranceSec?: number;
}

/** Svix webhook verification (used by Resend): HMAC-SHA256 over `id.timestamp.body`. Fails closed. */
export function verifySvix(i: SvixInput): boolean {
  if (!i.secret || !i.id || !i.timestamp || !i.signature) return false;
  const ts = Number(i.timestamp);
  const now = i.nowSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > (i.toleranceSec ?? 300)) return false;
  const key = Buffer.from(i.secret.replace(/^whsec_/, ""), "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${i.id}.${i.timestamp}.${i.body}`).digest();
  return i.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
