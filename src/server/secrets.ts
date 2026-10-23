import { timingSafeEqual } from "node:crypto";

/** Checks `Authorization: Bearer <secret>`. Unset or empty secret => always false (R-SEC-02). */
export function hasValidBearer(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const given = Buffer.from(authorization.slice(7));
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}
