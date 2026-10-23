import { describe, expect, it } from "vitest";
import { extractUrls, isBlockedAddress, isBlockedHostname, normalizeUrl, stripUrls } from "@/domain/links";

describe("[R-CAP-07] links in the body", () => {
  it("finds URLs in order, without trailing punctuation or duplicates", () => {
    const text = "Lis https://fr.wikipedia.org/wiki/Empire_inca, puis (https://example.org/a?x=1). Encore https://fr.wikipedia.org/wiki/Empire_inca !";
    expect(extractUrls(text)).toEqual(["https://fr.wikipedia.org/wiki/Empire_inca", "https://example.org/a?x=1"]);
  });
  it("ignores non-http schemes", () => {
    expect(extractUrls("ftp://x.org/a javascript:alert(1) file:///etc/passwd mailto:a@b.c")).toEqual([]);
  });
  it("keeps the user's own words when URLs are removed", () => {
    expect(stripUrls("J'ai lu cette page https://a.org/x j'ai appris des choses")).toBe("J'ai lu cette page j'ai appris des choses");
  });
});

describe("[R-PIPE-03] URL normalisation for dedup", () => {
  it("treats tracking parameters, fragments, www, case, trailing slash and http/https as the same page", () => {
    const base = normalizeUrl("https://example.org/article");
    for (const v of [
      "http://www.Example.org/article/",
      "https://example.org/article?utm_source=news&utm_medium=mail",
      "https://example.org/article#section-2",
      "https://example.org:443/article?fbclid=abc",
    ]) expect(normalizeUrl(v)).toBe(base);
  });
  it("keeps parameters that change the page, in a stable order", () => {
    expect(normalizeUrl("https://example.org/a?b=2&a=1")).toBe(normalizeUrl("https://example.org/a?a=1&b=2"));
    expect(normalizeUrl("https://example.org/a?id=1")).not.toBe(normalizeUrl("https://example.org/a?id=2"));
  });
  it("rejects what is not a web URL", () => {
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("ftp://example.org/a")).toBeNull();
  });
});

describe("[R-SEC-07] internal addresses are refused", () => {
  it("blocks loopback, private, link-local (cloud metadata), CGNAT and reserved IPv4", () => {
    for (const ip of ["127.0.0.1", "127.255.255.254", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1"])
      expect([ip, isBlockedAddress(ip)]).toEqual([ip, true]);
  });
  it("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.0.1", "172.32.0.1", "100.63.255.255"])
      expect([ip, isBlockedAddress(ip)]).toEqual([ip, false]);
  });
  it("blocks IPv6 loopback, unique-local, link-local, multicast and IPv4-mapped private addresses", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "[::1]", "64:ff9b::7f00:1"])
      expect([ip, isBlockedAddress(ip)]).toEqual([ip, true]);
  });
  it("allows public IPv6 and IPv4-mapped public addresses", () => {
    for (const ip of ["2606:4700:4700::1111", "2a00:1450:4007:80f::200e", "::ffff:8.8.8.8"])
      expect([ip, isBlockedAddress(ip)]).toEqual([ip, false]);
  });
  it("refuses anything that is not an IP address", () => {
    for (const ip of ["", "localhost", "example.org", "999.1.1.1", "1.2.3", "0x7f.0.0.1", "2130706433"])
      expect([ip, isBlockedAddress(ip)]).toEqual([ip, true]);
  });
  it("blocks internal hostnames whatever they resolve to", () => {
    for (const h of ["localhost", "app.localhost", "printer.local", "db.internal", "metadata.google.internal", "LOCALHOST."])
      expect([h, isBlockedHostname(h)]).toEqual([h, true]);
    expect(isBlockedHostname("example.org")).toBe(false);
  });
});
