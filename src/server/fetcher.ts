import dns from "node:dns";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { Agent, fetch as undiciFetch } from "undici";
import { htmlToText, normalizeSpace } from "@/domain/mail";
import { isBlockedAddress, isBlockedHostname } from "@/domain/links";
import { BRAND } from "@/config/brand";
import { appUrl } from "./config";

export type PageErrorKind = "blocked" | "http_error" | "timeout" | "unsupported_type" | "network";

export class PageError extends Error {
  constructor(
    readonly kind: PageErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PageError";
  }
}

export interface FetchedPage {
  url: string;
  finalUrl: string;
  title: string | null;
  text: string;
  status: number;
  contentType: string;
  fetchedAt: string;
}

export interface PageFetcher {
  fetchPage(url: string): Promise<FetchedPage>;
}

export interface FetcherOptions {
  maxBytes?: number;
  maxChars?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Decides whether a resolved IP is refused. Defaults to "anything not public" (R-SEC-07); tests relax it. */
  isBlockedIp?: (ip: string) => boolean;
  userAgent?: string;
  /** DNS resolver (tests inject one). */
  lookup?: typeof dns.lookup;
  /** Tests only: allow ports other than 80/443. */
  allowAnyPort?: boolean;
}

const ALLOWED_PORTS = new Set(["", "80", "443"]);

/**
 * Fetches a user-supplied URL safely (R-SEC-07): http(s) on ports 80/443 only, internal hostnames refused, and the
 * resolved IP checked AT CONNECTION TIME (so DNS rebinding and redirects cannot reach private ranges), a size cap,
 * a timeout, a redirect limit and a redirect re-check at every hop.
 */
export function createPageFetcher(opts: FetcherOptions = {}): PageFetcher {
  const maxBytes = opts.maxBytes ?? 3_000_000;
  const maxChars = opts.maxChars ?? 120_000;
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const maxRedirects = opts.maxRedirects ?? 4;
  const blocked = opts.isBlockedIp ?? isBlockedAddress;
  const resolve = opts.lookup ?? dns.lookup;
  const userAgent = opts.userAgent ?? `Mozilla/5.0 (compatible; ${BRAND.name}/1.0; +${appUrl()})`;

  const agent = new Agent({
    connect: {
      // Runs for every new connection, with the IP actually about to be used.
      lookup: (hostname, options, callback) => {
        resolve(hostname, { ...options, all: true }, (err, addresses) => {
          if (err) return callback(err, "", 0);
          const list = addresses as dns.LookupAddress[];
          const bad = list.find((a) => blocked(a.address));
          if (bad || list.length === 0) {
            return callback(new PageError("blocked", `refused address for ${hostname}`) as unknown as NodeJS.ErrnoException, "", 0);
          }
          if (options?.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
          return callback(null, list[0]!.address, list[0]!.family);
        });
      },
    },
  });

  function checkUrl(raw: string): URL {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new PageError("blocked", "not a valid URL");
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new PageError("blocked", "only http(s) is allowed");
    if (u.username || u.password) throw new PageError("blocked", "credentials in URL");
    if (!opts.allowAnyPort && !ALLOWED_PORTS.has(u.port)) throw new PageError("blocked", "port not allowed");
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (isBlockedHostname(host)) throw new PageError("blocked", "internal hostname");
    // A literal IP never reaches the DNS lookup, so check it here.
    if (/^[\d.]+$/.test(host) || host.includes(":")) {
      if (blocked(host)) throw new PageError("blocked", "refused address");
    }
    return u;
  }

  async function readCapped(body: ReadableStream<Uint8Array> | null): Promise<string> {
    if (!body) return "";
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      chunks.push(value);
      if (size >= maxBytes) {
        await reader.cancel();
        break;
      }
    }
    return Buffer.concat(chunks).subarray(0, maxBytes).toString("utf8");
  }

  return {
    async fetchPage(url: string): Promise<FetchedPage> {
      const signal = AbortSignal.timeout(timeoutMs);
      let current = checkUrl(url);
      for (let hop = 0; hop <= maxRedirects; hop++) {
        let res: Awaited<ReturnType<typeof undiciFetch>>;
        try {
          res = await undiciFetch(current, {
            dispatcher: agent,
            redirect: "manual",
            signal,
            headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1", "accept-language": "fr,en;q=0.8" },
          });
        } catch (err) {
          const cause = (err as { cause?: unknown }).cause ?? err;
          if (cause instanceof PageError) throw cause;
          if (signal.aborted) throw new PageError("timeout", "page took too long");
          throw new PageError("network", String(cause));
        }
        if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
          await res.body?.cancel();
          current = checkUrl(new URL(res.headers.get("location")!, current).toString());
          continue;
        }
        const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
        if (res.status >= 400 && res.status !== 401 && res.status !== 402 && res.status !== 403) {
          await res.body?.cancel();
          throw new PageError("http_error", `HTTP ${res.status}`, res.status);
        }
        if (res.status >= 400) {
          // 401/402/403: the page is behind a login or a paywall; the caller turns this into a receipt.
          await res.body?.cancel();
          return { url, finalUrl: current.toString(), title: null, text: "", status: res.status, contentType, fetchedAt: new Date().toISOString() };
        }
        const isHtml = contentType === "" || contentType === "text/html" || contentType === "application/xhtml+xml";
        const isText = contentType === "text/plain";
        if (!isHtml && !isText) {
          await res.body?.cancel();
          throw new PageError("unsupported_type", contentType || "unknown", res.status);
        }
        const raw = await readCapped(res.body as ReadableStream<Uint8Array> | null);
        const { title, text } = isHtml ? extractReadable(raw) : { title: null, text: normalizeSpace(raw) };
        return {
          url,
          finalUrl: current.toString(),
          title,
          text: text.slice(0, maxChars),
          status: res.status,
          contentType: contentType || "text/html",
          fetchedAt: new Date().toISOString(),
        };
      }
      throw new PageError("blocked", "too many redirects");
    },
  };
}

/** Main article text of an HTML page (Readability), with a plain tag-stripping fallback. */
export function extractReadable(html: string): { title: string | null; text: string } {
  try {
    const { document } = parseHTML(html);
    const article = new Readability(document as unknown as Document).parse();
    const text = normalizeSpace(article?.textContent ?? "");
    if (text.length >= 200) return { title: article?.title?.trim() || null, text };
    const fallback = htmlToText(html);
    return { title: article?.title?.trim() || null, text: fallback.length > text.length ? fallback : text };
  } catch {
    return { title: null, text: htmlToText(html) };
  }
}
