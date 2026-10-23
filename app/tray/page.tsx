import { getLocale, getTranslations } from "next-intl/server";
import { DROP_REASONS, type CardShortfall } from "@/domain/cards";
import { cleanSubject } from "@/domain/mail";
import { createSessionClient } from "@/supabase/server";
import { BinIcon } from "@/ui/bin-icon";
import { ConfirmSubmit } from "@/ui/confirm-submit";
import { keepFrenchSpaces } from "@/ui/typography";
import { discardCards, keepCards } from "./actions";

interface TrayCard {
  id: string;
  question: string;
  answer: string;
  rank: number;
  source: { id: string; title: string | null; kind: string; created_at: string };
  claim: { origin: "source" | "model" };
}

const KINDS = ["email_body", "user_note", "url", "file"] as const;
const sourceKind = (kind: string): (typeof KINDS)[number] => (KINDS as readonly string[]).includes(kind) ? (kind as (typeof KINDS)[number]) : "email_body";

/** R-TRAY-01: proposed cards grouped by source, newest first. RLS limits the query to the signed-in user. */
export default async function TrayPage() {
  const t = await getTranslations("tray");
  const tHelp = await getTranslations("help");
  const supabase = await createSessionClient();
  const { data } = await supabase
    .from("card")
    .select("id,question,answer,rank,source:source(id,title,kind,created_at),claim:claim(origin)")
    .eq("status", "proposed")
    .order("rank");
  const cards = (data ?? []) as unknown as TrayCard[];
  const groups = new Map<string, { title: string | null; kind: string; at: string; cards: TrayCard[] }>();
  for (const c of cards) {
    const g = groups.get(c.source.id) ?? { title: c.source.title, kind: c.source.kind, at: c.source.created_at, cards: [] };
    g.cards.push(c);
    groups.set(c.source.id, g);
  }
  const tIn = await getTranslations("inbox");
  const locale = await getLocale();
  const { data: mails } = await supabase
    .from("capture")
    .select("id,subject,status,error,created_at,notes")
    .is("parent_id", null)
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(20);
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const ordered = [...groups.entries()].sort((a, b) => b[1].at.localeCompare(a[1].at));

  return (
    <main className="tray">
      <div className="page-head">
        <h1>{t("title")}</h1>
        {ordered.length ? <p className="lede">{t("lede")}</p> : null}
      </div>
      {ordered.length === 0 ? (
        <p className="empty">
          {t("emptyTitle")}
          <span className="note">{t("empty")}</span>
          <a href="/help" data-testid="empty-help-link">{tHelp("title")}</a>
        </p>
      ) : null}
      {ordered.map(([sourceId, g]) => (
        <section key={sourceId} data-testid="tray-group" className="group">
          <div className="src">
            <h2>
              <span className="eyebrow" data-testid="source-meta">
                {t("sourceMeta", { kind: t(`kind.${sourceKind(g.kind)}`), date: day.format(new Date(g.at)) })}
              </span>
              {g.title || t("untitled")}
            </h2>
            <form className="actions">
              {g.cards.map((c) => (
                <input key={c.id} type="hidden" name="card_id" value={c.id} />
              ))}
              <button type="submit" formAction={keepCards} className="linkish">
                {t("keepAll")}
              </button>
              <ConfirmSubmit formAction={discardCards} count={g.cards.length} className="linkish with-icon">
                <BinIcon />
                {t("discardAll")}
              </ConfirmSubmit>
            </form>
          </div>
          <div className="group stack-cards">
            {g.cards.map((c) => (
              <article key={c.id} data-testid="tray-card" className="card">
                <div className="card-top">
                  {c.claim.origin === "model" ? (
                    <span className="note" data-testid="model-badge">
                      {t("badgeModel")}
                    </span>
                  ) : null}
                </div>
                <p className="q">{keepFrenchSpaces(c.question)}</p>
                <p className="a">
                  <span className="lab">{t("answer")}</span> {keepFrenchSpaces(c.answer)}
                </p>
                <form className="actions">
                  <input type="hidden" name="card_id" value={c.id} />
                  <button type="submit" formAction={keepCards} className="btn primary">
                    {t("keep")}
                  </button>
                  <button type="submit" formAction={discardCards} className="btn quiet with-icon">
                    <BinIcon />
                    {t("discard")}
                  </button>
                </form>
              </article>
            ))}
          </div>
        </section>
      ))}
      <section className="mails" data-testid="mail-list" aria-labelledby="mails-title">
        <h2 id="mails-title">{tIn("title")}</h2>
        <p className="lede">{tIn("lede")}</p>
        {(mails ?? []).length === 0 ? <p className="empty">{tIn("empty")}</p> : null}
        <ol>
          {(mails ?? []).map((m) => {
            const notes = (m.notes ?? {}) as { truncated?: unknown; ignoredUrls?: string[]; ignoredFiles?: string[]; cards?: CardShortfall };
            const ignored = (notes.ignoredUrls?.length ?? 0) + (notes.ignoredFiles?.length ?? 0);
            // R-CARD-10: fewer cards than the user asked for, with the counts per reason.
            const shortfall = notes.cards;
            const reasons = shortfall
              ? DROP_REASONS.filter((r) => (shortfall.dropped[r] ?? 0) > 0).map((r) => tIn(`dropped.${r}`, { n: shortfall.dropped[r] ?? 0 }))
              : [];
            const shortfallLine = shortfall
              ? tIn("shortfall", { requested: shortfall.requested, kept: shortfall.kept, reasons: reasons.length ? tIn("shortfallReasons", { list: reasons.join(", ") }) : "" })
              : null;
            return (
              <li key={m.id} data-testid="mail-row" data-status={m.status}>
                <time dateTime={m.created_at}>{fmt.format(new Date(m.created_at))}</time>
                <span className="subject">{cleanSubject(m.subject) || tIn("untitled")}</span>
                <span className="status">
                  {tIn(`status.${m.status as "received" | "processing" | "done" | "failed" | "duplicate"}`)}
                  {notes.truncated ? ` · ${tIn("partial")}` : ""}
                  {ignored ? ` · ${ignored} ${tIn("ignored")}` : ""}
                </span>
                {shortfallLine ? (
                  <span className="shortfall" data-testid="mail-shortfall">
                    {keepFrenchSpaces(shortfallLine)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}
