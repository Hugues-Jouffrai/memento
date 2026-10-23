// Writes every mail to mail-previews/ as HTML (light and dark) to open in a browser. Nothing is sent.
// Usage: pnpm tsx scripts/preview-mails.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { buildDoneReceipt, buildDuplicateReceipt, buildFailedReceipt, buildGroupReceipt, buildQuotaNotice, buildReminderMail, buildWaitlistConfirmMail, withHelpLine } from "../src/server/emails";
import { magicLinkTemplate } from "../src/server/auth-template";

const app = "https://leitnerbox-v2.vercel.app";
const done = buildDoneReceipt("fr", {
  title: "Les abeilles",
  pageTitle: "Les abeilles",
  summary: ["Les abeilles dansent pour indiquer la direction du nectar.", "Une ruche compte des dizaines de milliers d'individus."],
  cardQuestions: ["Comment les abeilles indiquent-elles la direction du nectar ?", "Combien d'individus compte une ruche ?"],
  trayUrl: `${app}/tray`,
});
const mails: Record<string, { html: string }> = {
  "signin-fr": { html: magicLinkTemplate().replace("{{ .ConfirmationURL }}", `${app}/auth/callback`).replace("{{ .Token }}", "482 910") },
  "receipt-fr": done,
  "receipt-first-fr": withHelpLine("fr", done, `${app}/help`),
  "receipt-en": buildDoneReceipt("en", { title: "Bees", pageTitle: "Bees", summary: ["Bees dance to show where the nectar is."], cardQuestions: ["How do bees show where the nectar is?"], trayUrl: `${app}/tray` }),
  "group-fr": buildGroupReceipt("fr", {
    title: "Deux liens",
    trayUrl: `${app}/tray`,
    items: [
      { outcome: "done", title: "Empire inca", pageTitle: "Empire inca", cardQuestions: ["Qui fonda l'empire inca ?"] },
      { outcome: "duplicate", title: "Teotihuacan" },
      { outcome: "failed", title: "Article payant", reason: "paywall" },
    ],
  }),
  "failed-fr": buildFailedReceipt("fr", { title: "Ma note", reason: "too_short" }),
  "duplicate-fr": buildDuplicateReceipt("fr", { title: "Les abeilles" }),
  "quota-fr": buildQuotaNotice("fr", "day"),
  "reminder-fr": buildReminderMail("fr", { todo: 12, minutes: 4, trayCount: 3, reviewUrl: `${app}/r/x`, unsubscribeUrl: `${app}/u/x`, oneClickUrl: `${app}/api/unsubscribe/x` }),
  "waitlist-fr": buildWaitlistConfirmMail("fr", { confirmUrl: `${app}/notify/confirm/example`, leaveUrl: `${app}/notify/leave/example`, days: 3 }),
  "waitlist-en": buildWaitlistConfirmMail("en", { confirmUrl: `${app}/notify/confirm/example`, leaveUrl: `${app}/notify/leave/example`, days: 3 }),
  "reminder-en":buildReminderMail("en", { todo: 12, minutes: 4, trayCount: 3, reviewUrl: `${app}/r/x`, unsubscribeUrl: `${app}/u/x`, oneClickUrl: `${app}/api/unsubscribe/x` }),
};
mkdirSync("mail-previews", { recursive: true });
for (const [name, m] of Object.entries(mails)) {
  writeFileSync(`mail-previews/${name}.html`, m.html);
  writeFileSync(`mail-previews/${name}-dark.html`, m.html.replace("@media (prefers-color-scheme: dark)", "@media all"));
}
console.log(`wrote ${Object.keys(mails).length * 2} files in mail-previews/`);
