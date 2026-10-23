/** Pure link rules: finding URLs in a note, normalising them for dedup, and refusing internal addresses (R-SEC-07). */

const URL_RE = /https?:\/\/[^\s<>"'()[\]]+/gi;
/** Characters that end a sentence but are not part of the URL. */
const TRAILING = /[.,;:!?»”’]+$/;

/** URLs in the order they appear, without duplicates, trailing punctuation removed. http(s) only. */
export function extractUrls(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0].replace(TRAILING, "");
    const key = normalizeUrl(raw);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(raw);
    }
  }
  return out;
}

const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|igshid|ref|ref_src|_hsenc|_hsmi|mkt_tok)$/i;

/** Canonical form of a URL, so the same page sent twice is recognised (R-PIPE-03). Null when it is not a valid http(s) URL. */
export function normalizeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAM.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : u.pathname;
  const port = u.port && !((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) ? `:${u.port}` : "";
  return `https://${u.hostname}${port}${path}${u.search}`;
}

/** The text of the note without its URLs: the user's own words. */
export function stripUrls(text: string): string {
  return text.replace(URL_RE, " ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = n * 256 + Number(p);
  }
  return n;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. broadcast
];

/** True when the IPv4 or IPv6 address is not a public internet address (or is not an IP at all). */
export function isBlockedAddress(ip: string): boolean {
  const addr = ip.trim().replace(/^\[|\]$/g, "").toLowerCase();
  const v4 = ipv4ToInt(addr);
  if (v4 !== null) {
    return V4_BLOCKED.some(([base, bits]) => {
      const b = ipv4ToInt(base)!;
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (v4 & mask) >>> 0 === (b & mask) >>> 0;
    });
  }
  if (!addr.includes(":")) return true; // not an IP address: refuse
  // IPv4-mapped / translated IPv6 (::ffff:a.b.c.d or ::ffff:7f00:1): check the embedded IPv4.
  const mapped = addr.match(/^(?:0{0,4}:){0,5}(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isBlockedAddress(mapped[1]!);
  const hexMapped = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1]!, 16);
    const lo = parseInt(hexMapped[2]!, 16);
    return isBlockedAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (addr === "::" || addr === "::1") return true; // unspecified, loopback
  const first = parseInt(addr.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (addr.startsWith("64:ff9b:")) return true; // NAT64: could embed a private IPv4
  if (addr.startsWith("2001:db8:")) return true; // documentation
  return false;
}

/** Hostnames that are internal whatever they resolve to. */
export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || h === "metadata.google.internal";
}
