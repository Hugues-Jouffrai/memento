import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type dns from "node:dns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classifyPage } from "@/domain/paywall";
import { PageError, createPageFetcher } from "./fetcher";

const ARTICLE = `<html><head><title>Empire inca - Wikipédia</title></head><body>
<nav><a href="/">Accueil</a> <a href="/menu">Menu</a></nav>
<article><h1>Empire inca</h1>
${"<p>L'Empire inca fut le plus grand empire de l'Amérique précolombienne, centré sur Cuzco. Son expansion débuta au XVe siècle sous Pachacutec.</p>".repeat(8)}
</article><footer>Cookies · Mentions légales</footer></body></html>`;

let server: Server;
let base: string;
let port: number;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/article") return void res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(ARTICLE);
    if (url === "/text") return void res.writeHead(200, { "content-type": "text/plain" }).end("Un texte brut assez court.");
    if (url === "/redirect-internal") return void res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
    if (url === "/redirect-ok") return void res.writeHead(302, { location: "/article" }).end();
    if (url === "/loop") return void res.writeHead(302, { location: "/loop" }).end();
    if (url === "/paywall") return void res.writeHead(403, { "content-type": "text/html" }).end("<p>Réservé aux abonnés</p>");
    if (url === "/missing") return void res.writeHead(404).end("nope");
    if (url === "/pdf") return void res.writeHead(200, { "content-type": "application/pdf" }).end("%PDF-1.4");
    if (url === "/huge") {
      res.writeHead(200, { "content-type": "text/html" });
      return void res.end("<p>" + "x".repeat(5_000_000) + "</p>");
    }
    if (url === "/slow") return void setTimeout(() => res.writeHead(200).end("late"), 3000);
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

/** Policy for tests that must reach the local server: loopback allowed, nothing else changes. */
const local = () => createPageFetcher({ isBlockedIp: (ip) => ip !== "127.0.0.1", allowAnyPort: true });

describe("[R-SEC-07] SSRF guard (default policy)", () => {
  const f = createPageFetcher();
  const refused = async (url: string) => {
    const err = await f.fetchPage(url).then(() => null, (e: unknown) => e);
    expect([url, err instanceof PageError ? err.kind : String(err)]).toEqual([url, "blocked"]);
  };
  it("refuses localhost and loopback, by name and by address", async () => {
    await refused(`${base}/article`);
    await refused(`http://localhost:${port}/article`);
    await refused("http://localhost/");
    await refused("http://[::1]/");
    await refused("http://127.1/"); // normalised to 127.0.0.1 by URL parsing
    await refused("http://2130706433/"); // decimal form of 127.0.0.1
  });
  it("refuses private ranges and the cloud metadata address", async () => {
    await refused("http://169.254.169.254/latest/meta-data/");
    await refused("http://10.0.0.1/");
    await refused("http://192.168.1.1/");
    await refused("http://172.16.0.1/");
    await refused("http://[fd00::1]/");
  });
  it("refuses other schemes, credentials in the URL and non-web ports", async () => {
    await refused("file:///etc/passwd");
    await refused("ftp://example.org/a");
    await refused("gopher://example.org/");
    await refused("http://user:pass@example.org/");
    await refused("http://example.org:22/");
    await refused("http://example.org:6379/");
  });
  it("refuses a public-looking hostname that RESOLVES to an internal address (checked at connection time)", async () => {
    const rebinding = ((host: string, _o: unknown, cb: (e: null, a: dns.LookupAddress[]) => void) =>
      cb(null, [{ address: "10.1.2.3", family: 4 }])) as unknown as typeof dns.lookup;
    const g = createPageFetcher({ lookup: rebinding });
    const err = await g.fetchPage("http://innocent.example/").then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(PageError);
    expect((err as PageError).kind).toBe("blocked");
  });
  it("refuses when any of several resolved addresses is internal", async () => {
    const mixed = ((host: string, _o: unknown, cb: (e: null, a: dns.LookupAddress[]) => void) =>
      cb(null, [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }])) as unknown as typeof dns.lookup;
    const err = await createPageFetcher({ lookup: mixed }).fetchPage("http://mixed.example/").then(() => null, (e: unknown) => e);
    expect((err as PageError).kind).toBe("blocked");
  });
});

describe("[R-PIPE-02] page fetching", () => {
  it("extracts the article text and title, without navigation or footer", async () => {
    const page = await local().fetchPage(`${base}/article`);
    expect(page.status).toBe(200);
    expect(page.title).toBe("Empire inca - Wikipédia");
    expect(page.text).toContain("plus grand empire de l'Amérique précolombienne");
    expect(page.text).not.toMatch(/Mentions légales|Accueil/);
    expect(classifyPage(page)).toBe("ok");
  });
  it("reads plain text", async () => {
    expect((await local().fetchPage(`${base}/text`)).text).toBe("Un texte brut assez court.");
  });
  it("follows a redirect and reports the final URL", async () => {
    const page = await local().fetchPage(`${base}/redirect-ok`);
    expect(page.finalUrl).toBe(`${base}/article`);
    expect(page.text).toContain("Empire");
  });
  it("[R-SEC-07] re-checks every redirect hop: a redirect to the metadata address is refused", async () => {
    const err = await local().fetchPage(`${base}/redirect-internal`).then(() => null, (e: unknown) => e);
    expect((err as PageError).kind).toBe("blocked");
  });
  it("gives up on a redirect loop", async () => {
    const err = await local().fetchPage(`${base}/loop`).then(() => null, (e: unknown) => e);
    expect((err as PageError).kind).toBe("blocked");
  });
  it("[R-PIPE-02] a 403 page comes back empty and is classified as paywalled; a 404 is an error", async () => {
    const page = await local().fetchPage(`${base}/paywall`);
    expect(page.text).toBe("");
    expect(classifyPage(page)).toBe("paywall");
    const err = await local().fetchPage(`${base}/missing`).then(() => null, (e: unknown) => e);
    expect(err).toMatchObject({ kind: "http_error", status: 404 });
  });
  it("refuses content types it cannot read yet (PDF links arrive with attachments)", async () => {
    const err = await local().fetchPage(`${base}/pdf`).then(() => null, (e: unknown) => e);
    expect((err as PageError).kind).toBe("unsupported_type");
  });
  it("caps the size read and the characters kept", async () => {
    const page = await createPageFetcher({ isBlockedIp: (ip) => ip !== "127.0.0.1", allowAnyPort: true, maxBytes: 100_000, maxChars: 5000 }).fetchPage(`${base}/huge`);
    expect(page.text.length).toBeLessThanOrEqual(5000);
  });
  it("times out on a slow server", async () => {
    const f = createPageFetcher({ isBlockedIp: (ip) => ip !== "127.0.0.1", allowAnyPort: true, timeoutMs: 300 });
    const err = await f.fetchPage(`${base}/slow`).then(() => null, (e: unknown) => e);
    expect((err as PageError).kind).toBe("timeout");
  });
  it("resolves names through the injected resolver and connects to the allowed address", async () => {
    const lookup = ((_h: string, _o: unknown, cb: (e: null, a: dns.LookupAddress[]) => void) =>
      cb(null, [{ address: "127.0.0.1", family: 4 }])) as unknown as typeof dns.lookup;
    const page = await createPageFetcher({ lookup, isBlockedIp: (ip) => ip !== "127.0.0.1", allowAnyPort: true }).fetchPage(`http://wiki.example:${port}/article`);
    expect(page.text).toContain("Empire inca");
  });
});

describe("[R-PIPE-02] paywall and empty-page detection", () => {
  it("classifies login walls, teasers and JS-only shells", () => {
    expect(classifyPage({ status: 403, text: "" })).toBe("paywall");
    expect(classifyPage({ status: 200, text: "Abonnez-vous pour lire la suite de cet article." })).toBe("paywall");
    expect(classifyPage({ status: 200, text: "You've reached your free article limit. Subscribe to continue." })).toBe("paywall");
    expect(classifyPage({ status: 200, text: "Loading..." })).toBe("empty");
    expect(classifyPage({ status: 200, text: "Un vrai article. ".repeat(100) })).toBe("ok");
  });
});
