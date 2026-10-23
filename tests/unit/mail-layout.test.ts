import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { magicLinkTemplate } from "@/server/auth-template";
import { buildDoneReceipt, buildDuplicateReceipt, buildFailedReceipt, buildGroupReceipt, buildQuotaNotice, buildReminderMail, buildWaitlistConfirmMail, withHelpLine } from "@/server/emails";
import { MAIL_COLORS, renderMail } from "@/server/mail-layout";
import { MAIL_MESSAGES } from "@/server/messages";
import { BRAND } from "@/config/brand";

const done = buildDoneReceipt("fr", { title: "T", pageTitle: "P", summary: ["a"], cardQuestions: ["q ?"], trayUrl: "https://app.test/tray" });
const reminder = buildReminderMail("en", { todo: 3, minutes: 2, trayCount: 1, reviewUrl: "https://app.test/r/x", unsubscribeUrl: "https://app.test/u/x", oneClickUrl: "https://app.test/api/unsubscribe/x" });
const all = {
  done,
  failed: buildFailedReceipt("en", { title: "T", reason: "too_short" }),
  duplicate: buildDuplicateReceipt("fr", { title: "T" }),
  group: buildGroupReceipt("fr", { title: "T", trayUrl: "https://app.test/tray", items: [{ outcome: "duplicate", title: "x" }] }),
  quota: buildQuotaNotice("fr", "month"),
  reminder,
  help: withHelpLine("fr", done, "https://app.test/help"),
  signin: { html: magicLinkTemplate() },
};

describe("signal-style mail layout (D53)", () => {
  for (const [name, m] of Object.entries(all)) {
    it(`${name}: a complete document with a dark mode, no scripts and no remote resources`, () => {
      expect(m.html.startsWith("<!doctype html>")).toBe(true);
      expect(m.html).toContain("prefers-color-scheme: dark");
      expect(m.html).toContain('name="color-scheme"');
      expect(m.html).not.toMatch(/<script|<link |<img |url\(|@import|src=/i);
      expect(m.html.match(/https?:\/\/[^"'\s<)]+/g)?.filter((u) => !u.startsWith("https://app.test") && !u.startsWith("http://www.w3.org")) ?? []).toEqual([]);
    });
  }

  it("the colours are the signal palette, light and dark", () => {
    expect(MAIL_COLORS.light).toMatchObject({ paper: "#f4f3ef", ink: "#0d0d0d", accent: "#ff4a1c" });
    expect(MAIL_COLORS.dark).toMatchObject({ paper: "#111110", ink: "#f2f0ea" });
    expect(done.html).toContain("#f4f3ef");
    expect(done.html).toContain("#111110");
  });

  it("every piece of text coming from a page or a mail is escaped", () => {
    const evil = '<script>alert(1)</script> "x" & <b>';
    const m = buildDoneReceipt("fr", { title: evil, pageTitle: evil, summary: [evil], cardQuestions: [evil], trayUrl: 'https://app.test/tray?"><script>' });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain('"><script');
    expect(m.html).toContain("&lt;script&gt;");
    expect(renderMail({ brand: "<b>", lang: "fr", kicker: "<i>", title: "<u>", blocks: [{ code: "<s>" }, { small: "<em>" }] })).not.toMatch(/<(b|i|u|s|em)>/);
  });

  it("the plain-text version is kept next to the HTML, with the same links", () => {
    expect(done.text).toContain("https://app.test/tray");
    expect(done.html).toContain("https://app.test/tray");
    expect(reminder.text).toContain("https://app.test/u/x");
    expect(reminder.html).toContain("https://app.test/u/x");
    expect(reminder.headers!["List-Unsubscribe"]).toBe("<https://app.test/api/unsubscribe/x>");
  });

  it("the first-receipt help line lands inside the page and no marker is left", () => {
    expect(all.help.html).toContain("https://app.test/help");
    expect(all.help.html).not.toContain("<!--extra-->");
    expect(all.help.html.indexOf("https://app.test/help")).toBeLessThan(all.help.html.indexOf("</body>"));
    expect(done.html).toContain("<!--extra-->"); // an ordinary receipt keeps the marker, which no client shows
  });

  it("[R-ACC-01] the sign-in template holds the code and no token link, and the file on disk is the generated one", () => {
    const tpl = magicLinkTemplate();
    expect(tpl).toContain("{{ .Token }}");
    // A scanner that opens a token link uses up the code too (D57): only the plain sign-in page link is allowed.
    for (const forbidden of ["ConfirmationURL", "TokenHash", "RedirectTo", "token_hash"]) expect(tpl).not.toContain(forbidden);
    expect(tpl).toContain("{{ .SiteURL }}/login");
    const placeholders = [...new Set([...tpl.matchAll(/\{\{[^}]*\}\}/g)].map((m) => m[0]))].sort();
    expect(placeholders).toEqual(["{{ .SiteURL }}", "{{ .Token }}"]);
    expect(readFileSync("supabase/templates/magic_link.html", "utf8").replace(/\r\n/g, "\n")).toBe(tpl + "\n");
  });
});

describe("[R-LAND-13] waitlist confirmation mail", () => {
  for (const lang of ["fr", "en"] as const) {
    it(`${lang}: both links, no placeholder, no image, its own footer, the brand in the subject`, () => {
      const m = buildWaitlistConfirmMail(lang, { confirmUrl: "https://app.test/notify/confirm/abc", leaveUrl: "https://app.test/notify/leave/def", days: 3 });
      for (const body of [m.html, m.text]) {
        expect(body).toContain("https://app.test/notify/confirm/abc");
        expect(body).toContain("https://app.test/notify/leave/def");
        expect(body).not.toMatch(/\{[A-Za-z]+\}/); // the HTML's own CSS has braces; an unfilled placeholder looks like {name}
      }
      expect(m.html).not.toContain("<img");
      const msgs = MAIL_MESSAGES[lang].email;
      expect(m.html).toContain(msgs.waitlist.footer.replace(/&/g, "&amp;"));
      expect(m.html).not.toContain(msgs.footer);
      expect(m.subject).toContain(BRAND.name);
    });
  }
});
