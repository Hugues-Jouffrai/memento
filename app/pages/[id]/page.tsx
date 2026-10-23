import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createSessionClient } from "@/supabase/server";
import { keepFrenchSpaces } from "@/ui/typography";
import { removeLink, removeQuestion, resolveQuestion } from "./actions";

interface ClaimRow {
  id: string;
  text: string;
  origin: "source" | "model";
  citation: { excerpt: string }[];
}

const KINDS = ["email_body", "user_note", "url", "file"] as const;
const sourceKind = (kind: string): (typeof KINDS)[number] => (KINDS as readonly string[]).includes(kind) ? (kind as (typeof KINDS)[number]) : "email_body";

/** One topic page of the knowledge base, fed by one or several sources. RLS means another user's page is simply not found. */
export default async function PageView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await getTranslations("pages");
  const day = new Intl.DateTimeFormat(await getLocale(), { day: "numeric", month: "short", year: "numeric" });
  const supabase = await createSessionClient();
  const { data: page } = await supabase.from("page").select("id,title").eq("id", id).maybeSingle();
  if (!page) notFound();
  const [{ data: version }, { data: claims }, { data: sources }] = await Promise.all([
    supabase.from("page_version").select("summary").eq("page_id", id).order("version", { ascending: false }).limit(1).single(),
    supabase.from("claim").select("id,text,origin,citation(excerpt)").eq("page_id", id).eq("status", "active").order("created_at"),
    supabase.from("source_page").select("source:source(id,title,url,kind,created_at)").eq("page_id", id),
  ]);
  // Related pages (R-KB-16) and what the sources leave open (R-KB-14). RLS limits both to the signed-in user.
  const [{ data: linkRows }, { data: questionRows }] = await Promise.all([
    supabase.from("page_link").select("id,page_a,page_b,reason").eq("status", "active").or(`page_a.eq.${id},page_b.eq.${id}`).order("created_at"),
    supabase.from("open_question").select("id,text").eq("page_id", id).eq("status", "open").order("created_at"),
  ]);
  const links = ((linkRows ?? []) as { id: string; page_a: string; page_b: string; reason: string }[]).map((l) => ({ id: l.id, other: l.page_a === id ? l.page_b : l.page_a, reason: l.reason }));
  const { data: otherPages } = links.length ? await supabase.from("page").select("id,title").in("id", links.map((l) => l.other)) : { data: [] };
  const titleOf = new Map(((otherPages ?? []) as { id: string; title: string }[]).map((p) => [p.id, p.title]));
  const related = links.filter((l) => titleOf.has(l.other)).map((l) => ({ ...l, title: titleOf.get(l.other)! }));
  const questions = (questionRows ?? []) as { id: string; text: string }[];
  const sourceRows = ((sources ?? []) as unknown as { source: { id: string; title: string | null; url: string | null; kind: string; created_at: string } }[]).map((r) => r.source);
  const summary = (version?.summary as string[]) ?? [];
  // Footnote numbers for the excerpts, in claim order. Revue shows the excerpts as numbered notes
  // (a margin column on a wide screen); the other styles show each excerpt under its claim.
  const facts = ((claims ?? []) as unknown as ClaimRow[]).map((c, i) => ({ ...c, n: i + 1 }));
  const notes = facts.filter((c) => c.citation[0]).map((c, i) => ({ id: c.id, fact: c.n, note: i + 1, excerpt: c.citation[0]!.excerpt }));
  const noteOf = new Map(notes.map((n) => [n.id, n.note]));
  return (
    <main className="topic">
      <div className="kicker">
        <Link href="/pages" className="back">{t("back")}</Link>
      </div>
      <div className="sheet">
        <h1>{page.title as string}</h1>
        {summary.length ? (
          <section className="section">
            <h2>{t("summary")}</h2>
            <ul className="plain summary">
              {summary.map((s) => (
                <li key={s}>{keepFrenchSpaces(s)}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="section">
          <h2>{t("claims")}</h2>
          <ol className="facts">
            {facts.map((c) => (
              <li key={c.id} id={`fact-${c.n}`}>
                <span className="t">
                  {keepFrenchSpaces(c.text)}
                  {noteOf.has(c.id) ? (
                    <sup className="fn">
                      <a href={`#note-${noteOf.get(c.id)}`} aria-label={t("noteRef", { n: noteOf.get(c.id)! })}>
                        {noteOf.get(c.id)}
                      </a>
                    </sup>
                  ) : null}
                </span>
                {c.origin === "model" ? <span className="note">{t("badgeModel")}</span> : null}
                {c.citation[0] ? (
                  <blockquote>
                    <span className="eyebrow">{t("source")}</span>
                    <q>{c.citation[0].excerpt}</q>
                  </blockquote>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
        {related.length ? (
          <section className="section related" data-testid="related-pages">
            <h2>{t("related")}</h2>
            <ul className="plain related-list">
              {related.map((l) => (
                <li key={l.id}>
                  <Link href={`/pages/${l.other}`}>{keepFrenchSpaces(l.title)}</Link>
                  <span className="reason">{keepFrenchSpaces(l.reason)}</span>
                  <form action={removeLink} className="row-actions">
                    <input type="hidden" name="link_id" value={l.id} />
                    <input type="hidden" name="page_id" value={id} />
                    <button type="submit" className="btn quiet" aria-label={t("removeLinkTo", { title: l.title })}>
                      {t("remove")}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {questions.length ? (
          <section className="section questions" data-testid="open-questions">
            <h2>{t("openQuestions")}</h2>
            <ul className="plain">
              {questions.map((q) => (
                <li key={q.id}>
                  <span>{keepFrenchSpaces(q.text)}</span>
                  <form className="row-actions">
                    <input type="hidden" name="question_id" value={q.id} />
                    <input type="hidden" name="page_id" value={id} />
                    <button type="submit" formAction={resolveQuestion} className="btn quiet">
                      {t("resolve")}
                    </button>
                    <button type="submit" formAction={removeQuestion} className="btn quiet">
                      {t("remove")}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {notes.length ? (
          <section className="section notes">
            <h2>{t("excerpts")}</h2>
            <ol className="notes-list">
              {notes.map((n) => (
                <li key={n.id} id={`note-${n.note}`}>
                  <a className="ref" href={`#fact-${n.fact}`} aria-label={t("noteBack", { n: n.fact })}>
                    {n.note}
                  </a>
                  <p>
                    <mark>{n.excerpt}</mark>
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        <section className="section">
          <h2>{t("sources")}</h2>
          <ul className="plain biblio">
            {sourceRows.map((s) => (
              <li key={s.id}>
                {s.title || s.url || t("source")}
                <span className="note" data-testid="source-meta">
                  {` ${t("sourceMeta", { kind: t(`kind.${sourceKind(s.kind)}`), date: day.format(new Date(s.created_at)) })}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
