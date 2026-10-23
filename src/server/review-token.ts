import { createHmac, timingSafeEqual } from "node:crypto";

export const REVIEW_TOKEN_TTL_SECONDS = 24 * 3600;
/** Unsubscribe links sit in old mails: they stay valid for a year (D53). */
export const UNSUBSCRIBE_TOKEN_TTL_SECONDS = 365 * 24 * 3600;

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

function makeToken(purpose: string, ttl: number, userId: string, secret: string | undefined, nowSec: number): string {
  if (!secret) throw new Error("REVIEW_LINK_SECRET is not set");
  const payload = b64(`${purpose}.${userId}.${nowSec + ttl}`);
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the user id, or null for anything expired, tampered, for another purpose, or if the secret is unset. */
function readToken(purpose: string, token: string | undefined, secret: string | undefined, nowSec: number): string | null {
  if (!secret || !token) return null;
  const [payload, sig, ...rest] = token.split(".");
  if (!payload || !sig || rest.length) return null;
  const want = Buffer.from(sign(payload, secret));
  const given = Buffer.from(sig);
  if (want.length !== given.length || !timingSafeEqual(want, given)) return null;
  const [p, userId, exp] = Buffer.from(payload, "base64url").toString().split(".");
  if (p !== purpose || !userId || !/^[0-9a-f-]{36}$/.test(userId) || !exp || Number(exp) < nowSec) return null;
  return userId;
}

const now = () => Math.floor(Date.now() / 1000);

/** R-REV-05: a signed link valid 24 h that identifies a review session for one user and nothing else. */
export const createReviewToken = (userId: string, secret: string | undefined, nowSec = now()) => makeToken("review", REVIEW_TOKEN_TTL_SECONDS, userId, secret, nowSec);
export const verifyReviewToken = (token: string | undefined, secret: string | undefined, nowSec = now()) => readToken("review", token, secret, nowSec);

/** R-NOT-04: a signed link that can only pause or stop that user's reminders. */
export const createUnsubscribeToken = (userId: string, secret: string | undefined, nowSec = now()) => makeToken("unsubscribe", UNSUBSCRIBE_TOKEN_TTL_SECONDS, userId, secret, nowSec);
export const verifyUnsubscribeToken = (token: string | undefined, secret: string | undefined, nowSec = now()) => readToken("unsubscribe", token, secret, nowSec);
