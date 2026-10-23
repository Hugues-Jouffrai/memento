import { createTranslator } from "next-intl";
import { BRAND } from "@/config/brand";
import { MAX_ITEMS_PER_MAIL } from "@/domain/items";
import { EXTRA_MARKER, esc, renderMail, type Block } from "./mail-layout";
import { MAIL_MESSAGES } from "./messages";
import type { FailureReason, OutboundMail } from "./ports";

export type Lang = "fr" | "en";
type Mail = Omit<OutboundMail, "to">;

function translator(lang: Lang) {
  return createTranslator({ locale: lang, messages: MAIL_MESSAGES[lang], namespace: "email" });
}

function html(lang: Lang, o: { kicker: string; title: string; blocks: Block[]; preview?: string }): string {
  const t = translator(lang);
  return renderMail({ brand: BRAND.name, lang, footer: { text: t("footer") }, ...o });
}

/** Subject + plain text + signal-style HTML for a short message made of paragraphs and bullets. */
function render(lang: Lang, kicker: string, subject: string, lines: string[], bullets: string[] = []): Mail {
  const text = [...lines, ...bullets.map((b) => `- ${b}`)].join("\n\n").replace(/\n\n- /g, "\n- ");
  return { subject, text, html: html(lang, { kicker, title: lines[0] ?? subject, blocks: [...lines.slice(1).map((p) => ({ p })), ...(bullets.length ? [{ ul: bullets }] : [])], preview: lines[0] }) };
}

export interface DoneReceipt {
  title: string;
  pageTitle: string;
  /** The source was added to a page that already existed (topic matching, R-KB-02). */
  pageUpdated?: boolean;
  summary: string[];
  cardQuestions: string[];
  trayUrl: string;
  /** Links in the mail that were not processed (beyond the cap per mail). */
  ignoredUrls?: string[];
  /** Attachments that were not read (unsupported formats, or beyond the cap per mail). */
  ignoredFiles?: string[];
  /** The source was longer than what was read (R-PIPE-06). */
  truncated?: boolean;
}

function extraLines(t: ReturnType<typeof translator>, r: { truncated?: boolean; ignoredUrls?: string[]; ignoredFiles?: string[] }): string[] {
  const extra: string[] = [];
  if (r.truncated) extra.push(t("receipt.truncated"));
  if (r.ignoredUrls?.length) extra.push(t("receipt.ignoredLinks", { max: MAX_ITEMS_PER_MAIL }) + " " + r.ignoredUrls.join(", "));
  if (r.ignoredFiles?.length) extra.push(t("receipt.ignoredFiles", { max: MAX_ITEMS_PER_MAIL }) + " " + r.ignoredFiles.join(", "));
  return extra;
}

/** R-CAP-06: what was understood, which page was created, how many cards were proposed, link to the tray. */
export function buildDoneReceipt(lang: Lang, r: DoneReceipt): Mail {
  const t = translator(lang);
  const title = r.title || t("receipt.untitled");
  const subject = t("receipt.doneSubject", { title });
  const intro = t("receipt.doneIntro", { title });
  const summaryTitle = t("receipt.summaryTitle");
  const pageLine = t(r.pageUpdated ? "receipt.pageUpdatedLine" : "receipt.pageLine", { title: r.pageTitle });
  const cardsLine = t("receipt.cardsLine", { count: r.cardQuestions.length });
  const trayLine = t("receipt.trayLink", { url: r.trayUrl });
  const extra = extraLines(t, r);
  const text = [intro, "", summaryTitle + ":", ...r.summary.map((x) => "- " + x), "", pageLine, cardsLine, ...r.cardQuestions.map((q) => "• " + q), ...(extra.length ? ["", ...extra] : []), "", trayLine].join("\n");
  const blocks: Block[] = [
    { label: summaryTitle },
    { ul: r.summary },
    { p: pageLine },
    { p: cardsLine },
    ...(r.cardQuestions.length ? [{ ul: r.cardQuestions }] : []),
    ...extra.map((x) => ({ small: x })),
    { button: { label: t("receipt.trayCta"), url: r.trayUrl } },
  ];
  return { subject, text, html: html(lang, { kicker: t("kicker.receipt"), title: intro, blocks, preview: pageLine }) };
}

export function buildFailedReceipt(lang: Lang, r: { title: string; reason: FailureReason }): Mail {
  const t = translator(lang);
  const title = r.title || t("receipt.untitled");
  return render(lang, t("kicker.failed"), t("receipt.failedSubject"), [t("receipt.failedIntro", { title }), t(`receipt.reason.${r.reason}`)]);
}

export function buildDuplicateReceipt(lang: Lang, r: { title: string }): Mail {
  const t = translator(lang);
  const title = r.title || t("receipt.untitled");
  return render(lang, t("kicker.receipt"), t("duplicateSubject", { title }), [t("duplicateIntro")]);
}

/** One source of a mail with several, as the combined receipt reports it. */
export type GroupItem =
  | { outcome: "done"; title: string; pageTitle: string; cardQuestions: string[] }
  | { outcome: "duplicate"; title: string }
  | { outcome: "failed"; title: string; reason: FailureReason };

export interface GroupReceipt {
  title: string;
  items: GroupItem[];
  trayUrl: string;
  ignoredUrls?: string[];
  ignoredFiles?: string[];
  truncated?: boolean;
}

/** One receipt for a mail with several links or files (M3 step 0): what happened to each source, then the tray link. */
export function buildGroupReceipt(lang: Lang, r: GroupReceipt): Mail {
  const t = translator(lang);
  const title = r.title || t("receipt.untitled");
  const count = r.items.length;
  const subject = t("receipt.groupSubject", { title, count });
  const intro = t("receipt.groupIntro", { title, count });
  const trayLine = t("receipt.trayLink", { url: r.trayUrl });
  const blocks = r.items.map((i) => {
    const label = i.title || t("receipt.untitled");
    if (i.outcome === "done") return { head: t("receipt.groupDone", { title: label, page: i.pageTitle, count: i.cardQuestions.length }), bullets: i.cardQuestions };
    if (i.outcome === "duplicate") return { head: t("receipt.groupDuplicate", { title: label }), bullets: [] as string[] };
    return { head: `${t("receipt.groupFailed", { title: label })} ${t(`receipt.reason.${i.reason}`)}`, bullets: [] as string[] };
  });
  const extra = extraLines(t, r);
  const text = [
    intro,
    "",
    ...blocks.flatMap((b, n) => [`${n + 1}. ${b.head}`, ...b.bullets.map((q) => `   • ${q}`)]),
    ...(extra.length ? ["", ...extra] : []),
    "",
    trayLine,
  ].join("\n");
  const htmlBlocks: Block[] = [
    ...blocks.flatMap((b): Block[] => [{ p: b.head }, ...(b.bullets.length ? [{ ul: b.bullets }] : [])]),
    ...extra.map((x) => ({ small: x })),
    { button: { label: t("receipt.trayCta"), url: r.trayUrl } },
  ];
  return { subject, text, html: html(lang, { kicker: t("kicker.receipt"), title: intro, blocks: htmlBlocks, preview: blocks[0]?.head }) };
}

/** D53: the user's AI allowance is used up; their notes wait and resume on their own. Sent at most once a day. */
export function buildQuotaNotice(lang: Lang, window: "day" | "month"): Mail {
  const t = translator(lang);
  return render(lang, t("kicker.quota"), t("quota.subject"), [t("quota.intro"), t(`quota.${window}`), t("quota.reassure")]);
}

export interface ReminderMail {
  todo: number;
  minutes: number;
  trayCount: number;
  reviewUrl: string;
  unsubscribeUrl: string;
  oneClickUrl: string;
}

/** R-NOT-01, R-NOT-04: the daily reminder, with its review link and the pause/unsubscribe link and headers. */
export function buildReminderMail(lang: Lang, r: ReminderMail): Mail {
  const t = createTranslator({ locale: lang, messages: MAIL_MESSAGES[lang], namespace: "email.reminder" });
  const tMail = translator(lang);
  const lines = [t("intro"), t("due", { count: r.todo }), t("minutes", { minutes: r.minutes }), t("tray", { count: r.trayCount })];
  return {
    subject: t("subject", { count: r.todo }),
    text: [...lines, "", t("link", { url: r.reviewUrl }), "", t("footer", { url: r.unsubscribeUrl })].join("\n"),
    html: renderMail({
      brand: BRAND.name,
      lang,
      kicker: tMail("kicker.reminder"),
      title: lines[0]!,
      preview: lines[1],
      blocks: [{ p: lines[1]! }, { p: `${lines[2]!} ${lines[3]!}` }, { button: { label: t("cta"), url: r.reviewUrl } }, { small: tMail("reminderLinkNote") }],
      footer: { text: tMail("footer"), links: [{ label: t("footerLink"), url: r.unsubscribeUrl }] },
    }),
    headers: { "List-Unsubscribe": `<${r.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

export interface WaitlistConfirmMail {
  confirmUrl: string;
  leaveUrl: string;
  days: number;
}

/** R-LAND-13: the only mail of the notify-me list. Own footer: the person has no account. */
export function buildWaitlistConfirmMail(lang: Lang, m: WaitlistConfirmMail): Mail {
  const t = createTranslator({ locale: lang, messages: MAIL_MESSAGES[lang], namespace: "email.waitlist" });
  const intro = t("intro");
  const validity = t("validity", { days: m.days });
  const notYou = t("notYou");
  return {
    subject: t("subject"),
    text: [t("title"), intro, t("ctaText", { url: m.confirmUrl }), validity, notYou, t("leaveLine", { url: m.leaveUrl }), t("footer")].join("\n\n"),
    html: renderMail({
      brand: BRAND.name,
      lang,
      kicker: t("kicker"),
      title: t("title"),
      preview: intro,
      blocks: [{ p: intro }, { button: { label: t("cta"), url: m.confirmUrl } }, { small: validity }, { p: notYou }],
      footer: { text: t("footer"), links: [{ label: t("leaveLinkText"), url: m.leaveUrl }] },
    }),
  };
}

/** R-ONB-06: the first receipt a new user ever gets ends with a link to the help page. */
export function withHelpLine(lang: Lang, mail: Mail, helpUrl: string): Mail {
  const t = translator(lang);
  return {
    ...mail,
    text: `${mail.text}\n\n${t("helpLine", { url: helpUrl })}`,
    html: mail.html.replace(EXTRA_MARKER, `<p class="muted" style="margin:8px 0 16px;font:400 14px/1.5 Arial,Helvetica,sans-serif;"><a class="link" href="${esc(helpUrl)}" style="color:#0d0d0d;text-decoration:underline;">${esc(t("helpLinkText"))}</a></p>`),
  };
}
