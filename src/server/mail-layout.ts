/**
 * One HTML layout for every mail, in the "signal" look (D48, D53): paper background, heavy ink rules, a flat
 * orange mark, mono kicker, bold condensed headline, one ink button. Mail clients ignore external CSS and most
 * web fonts, so everything is table based with inline styles and system font stacks; a `<style>` block only adds
 * dark mode for the clients that read it (Apple Mail, Gmail apps). No images, no remote resources, no scripts.
 */

export const MAIL_COLORS = {
  light: { paper: "#f4f3ef", ink: "#0d0d0d", muted: "#5a5953", accent: "#ff4a1c", highlight: "#ffc629" },
  dark: { paper: "#111110", ink: "#f2f0ea", muted: "#9c9a93", accent: "#ff6a40", highlight: "#ffc629" },
} as const;

const SANS = `'Archivo Narrow','Arial Narrow',Arial,Helvetica,sans-serif`;
const BODY = `Arial,Helvetica,sans-serif`;
const MONO = `'IBM Plex Mono','Courier New',Courier,monospace`;

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type Block =
  | { p: string }
  | { ul: string[] }
  | { ol: string[] }
  | { label: string }
  | { code: string }
  | { small: string }
  | { button: { label: string; url: string } };

export interface MailLayout {
  brand: string;
  lang: string;
  /** Short mono line above the title ("RECEIPT", "REMINDER"). */
  kicker: string;
  title: string;
  blocks: Block[];
  /** Hidden preview line shown by inboxes next to the subject. */
  preview?: string;
  footer?: { text: string; links?: { label: string; url: string }[] };
}

const L = MAIL_COLORS.light;

function block(b: Block): string {
  if ("p" in b) return `<p class="ink" style="margin:0 0 16px;font:400 16px/1.5 ${BODY};color:${L.ink};">${esc(b.p)}</p>`;
  if ("small" in b) return `<p class="muted" style="margin:0 0 16px;font:400 13px/1.5 ${BODY};color:${L.muted};">${esc(b.small)}</p>`;
  if ("label" in b) return `<p class="muted" style="margin:24px 0 8px;font:600 12px/1.2 ${MONO};letter-spacing:0.08em;text-transform:uppercase;color:${L.muted};">${esc(b.label)}</p>`;
  if ("ul" in b || "ol" in b) {
    const tag = "ul" in b ? "ul" : "ol";
    const items = "ul" in b ? b.ul : b.ol;
    return `<${tag} class="ink" style="margin:0 0 16px;padding:0 0 0 22px;font:400 16px/1.5 ${BODY};color:${L.ink};">${items.map((i) => `<li style="margin:0 0 6px;">${esc(i)}</li>`).join("")}</${tag}>`;
  }
  if ("code" in b) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr><td class="code" style="background:${L.highlight};border:2px solid ${L.ink};padding:12px 20px;font:700 30px/1.1 ${MONO};letter-spacing:0.3em;color:#0d0d0d;">${esc(b.code)}</td></tr></table>`;
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td class="btn" bgcolor="${L.ink}" style="background:${L.ink};border:2px solid ${L.ink};"><a class="btn-a" href="${esc(b.button.url)}" style="display:inline-block;padding:14px 24px;font:700 14px/1 ${SANS};letter-spacing:0.06em;text-transform:uppercase;color:${L.paper};text-decoration:none;">${esc(b.button.label)}</a></td></tr></table>`;
}

const DARK_CSS = `
@media (prefers-color-scheme: dark){
  .bg{background:${MAIL_COLORS.dark.paper} !important}
  .card{background:${MAIL_COLORS.dark.paper} !important;border-color:${MAIL_COLORS.dark.ink} !important}
  .ink{color:${MAIL_COLORS.dark.ink} !important}
  .muted{color:${MAIL_COLORS.dark.muted} !important}
  .accent{background:${MAIL_COLORS.dark.accent} !important}
  .rule{border-color:${MAIL_COLORS.dark.ink} !important}
  .btn{background:${MAIL_COLORS.dark.ink} !important;border-color:${MAIL_COLORS.dark.ink} !important}
  .btn-a{color:${MAIL_COLORS.dark.paper} !important}
  a.link{color:${MAIL_COLORS.dark.ink} !important}
}
@media (max-width:620px){ .card{width:100% !important} .pad{padding:20px 18px !important} h1{font-size:30px !important} }`;

/** Marker where the first-receipt help line goes (see `withHelpLine`). */
export const EXTRA_MARKER = "<!--extra-->";

export function renderMail(m: MailLayout): string {
  const footerLinks = (m.footer?.links ?? []).map((l) => `<a class="link" href="${esc(l.url)}" style="color:${L.ink};text-decoration:underline;">${esc(l.label)}</a>`).join(" &middot; ");
  return `<!doctype html>
<html lang="${esc(m.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(m.title)}</title><style>${DARK_CSS}</style></head>
<body class="bg" style="margin:0;padding:0;background:${L.paper};">
${m.preview ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${L.paper};">${esc(m.preview)}</div>` : ""}
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${L.paper}" style="background:${L.paper};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="card" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="${L.paper}" style="width:560px;max-width:100%;background:${L.paper};border:2px solid ${L.ink};">
<tr><td class="accent" height="8" bgcolor="${L.accent}" style="background:${L.accent};height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>
<tr><td class="pad" style="padding:20px 28px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="ink" style="font:900 22px/1 ${SANS};letter-spacing:-0.01em;text-transform:uppercase;color:${L.ink};">${esc(m.brand)}</td>
<td align="right" class="muted" style="font:600 12px/1 ${MONO};letter-spacing:0.08em;text-transform:uppercase;color:${L.muted};">${esc(m.kicker)}</td>
</tr></table></td></tr>
<tr><td class="pad" style="padding:0 28px;"><table role="presentation" class="rule" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;border-top:2px solid ${L.ink};"><tr><td style="font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
<tr><td class="pad" style="padding:20px 28px 8px;">
<h1 class="ink" style="margin:0 0 18px;font:900 34px/1.05 ${SANS};letter-spacing:-0.015em;text-transform:uppercase;color:${L.ink};">${esc(m.title)}</h1>
${m.blocks.map(block).join("\n")}
${EXTRA_MARKER}
</td></tr>
${m.footer ? `<tr><td class="pad" style="padding:0 28px 24px;"><table role="presentation" class="rule" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${L.ink};"><tr><td class="muted" style="padding-top:14px;font:400 12px/1.5 ${MONO};color:${L.muted};">${esc(m.footer.text)}${footerLinks ? `<br>${footerLinks}` : ""}</td></tr></table></td></tr>` : ""}
</table>
</td></tr></table>
</body></html>`;
}
