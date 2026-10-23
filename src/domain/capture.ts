/** Pure capture rules: addresses, tokens, shared address, sender and DKIM checks (R-CAP-01, R-CAP-02, R-CAP-03, R-CAP-12). */

/** "Name <a@b.c>" or "a@b.c" -> "a@b.c" (lowercase), or null when it is not an address. */
export function parseAddress(raw: string): string | null {
  const m = raw.match(/<([^<>\s]+@[^<>\s]+)>\s*$/) ?? raw.trim().match(/^([^<>\s]+@[^<>\s]+)$/);
  return m?.[1] ? m[1].toLowerCase() : null;
}

const TOKEN_RE = /^[0-9a-f]{20}$/;

/** Finds the capture token among recipient addresses (local part of `<token>@...`). */
export function captureTokenFrom(recipients: readonly string[]): string | null {
  for (const r of recipients) {
    const addr = parseAddress(r);
    const local = addr?.split("@")[0];
    if (local && TOKEN_RE.test(local)) return local;
  }
  return null;
}

/** Local part of the shared capture address (R-CAP-12, D50). */
export const SHARED_LOCAL_PART = "add";

/**
 * R-CAP-12: whether the mail was sent to the shared address `add@<domain>`. The local part must be exactly `add`
 * (any case). Plus-tags (`add+x@`) are refused: no mail client adds them by itself and accepting them would only widen
 * what counts as the shared address. The domain must be the configured receiving domain or a Resend `*.resend.app`
 * domain (the ones the token addresses are documented for), so a header recipient such as `add@other-service.com` on a
 * mail that reached us through another address is not taken for ours.
 */
export function isSharedCaptureAddress(recipients: readonly string[], receivingDomain: string | null): boolean {
  return recipients.some((r) => {
    const addr = parseAddress(r);
    if (!addr) return false;
    const at = addr.lastIndexOf("@");
    const local = addr.slice(0, at);
    const domain = addr.slice(at + 1);
    if (local !== SHARED_LOCAL_PART) return false;
    return (receivingDomain !== null && domain === receivingDomain.toLowerCase()) || /^[a-z0-9-]+\.resend\.app$/.test(domain);
  });
}

export type CaptureRoute = "token" | "shared";

/** Resend's `authentication` of a received mail (`null` for mail received before the field existed). */
export interface MailAuthentication {
  spf?: string | null;
  dkim?: string | null;
  dmarc?: string | null;
}

export type AuthDecision = "accept" | "reject" | "wait";

/**
 * R-CAP-03 / R-CAP-12 (D50): the DKIM rule. The shared address accepts only `pass` (gray, fail, processing_failed,
 * unknown or a missing result are refused); `processing` (not documented by Resend, handled defensively) means "ask
 * again later". The token path, where the secret token is the first factor, refuses only an explicit `fail`.
 */
export function authDecision(route: CaptureRoute, auth: MailAuthentication | null | undefined): AuthDecision {
  const dkim = auth?.dkim ?? null;
  if (route === "token") return dkim === "fail" ? "reject" : "accept";
  if (dkim === "pass") return "accept";
  if (dkim === "processing") return "wait";
  return "reject";
}

/** R-CAP-02: only the account email (or, from phase B, a verified linked address) may capture. */
export function isAcceptedSender(sender: string, accountEmail: string, verifiedLinked: readonly string[] = []): boolean {
  const s = parseAddress(sender);
  if (!s) return false;
  return [accountEmail, ...verifiedLinked].some((a) => a.trim().toLowerCase() === s);
}
