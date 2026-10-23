import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatInterval, previewIntervals } from "@/domain/scheduling";
import { loadProfile, nextCard } from "@/server/review-queue";
import { reviewViewer } from "@/server/viewer";
import { createAdminClient } from "@/supabase/admin";
import { keepFrenchSpaces } from "@/ui/typography";
import { editCard, gradeCard, suspendCard } from "./actions";

type SearchParams = Promise<{ show?: string; recall?: string; continue?: string; edit?: string; error?: string }>;

const GRADES = [
  { grade: 1, key: "again" },
  { grade: 2, key: "hard" },
  { grade: 3, key: "good" },
  { grade: 4, key: "easy" },
] as const;

/** Suspend / edit controls (R-CARD-07). Only offered to a fully signed-in user. */
function cardTools(t: (key: "edit" | "suspend") => string, cardId: string, continueAnyway: boolean) {
  return (
    <div className="actions" data-testid="card-tools">
      <Link href={`/review?edit=${cardId}${continueAnyway ? "&continue=1" : ""}`} className="btn quiet">
        {t("edit")}
      </Link>
      <form action={suspendCard}>
        <input type="hidden" name="card_id" value={cardId} />
        {continueAnyway ? <input type="hidden" name="continue" value="1" /> : null}
        <button type="submit" className="btn quiet">
          {t("suspend")}
        </button>
      </form>
    </div>
  );
}

export default async function ReviewPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await reviewViewer();
  if (!viewer) redirect("/login");
  const sp = await searchParams;
  const t = await getTranslations("review");
  const db = createAdminClient();
  const continueAnyway = sp.continue === "1";
  const head = (
    <div className="kicker">
      <h1>{t("title")}</h1>
    </div>
  );

  // R-CARD-07: edit the wording of a card (full sign-in only; history is kept, version goes up).
  if (sp.edit && /^[0-9a-f-]{36}$/.test(sp.edit) && viewer.via === "session") {
    const { data: card } = await db.from("card").select("id,question,answer").eq("id", sp.edit).eq("user_id", viewer.userId).maybeSingle();
    if (card) {
      return (
        <main className="review edit">
          <div className="kicker">
            <h1>{t("editTitle")}</h1>
          </div>
          {sp.error ? <p role="alert">{t("editError")}</p> : null}
          <form action={editCard} className="stack">
            <input type="hidden" name="card_id" value={card.id as string} />
            {continueAnyway ? <input type="hidden" name="continue" value="1" /> : null}
            <label className="field">
              <span>{t("editQuestion")}</span>
              <textarea name="question" defaultValue={card.question as string} maxLength={1000} required />
            </label>
            <label className="field">
              <span>{t("editAnswer")}</span>
              <textarea name="answer" defaultValue={card.answer as string} maxLength={1000} required />
            </label>
            <p className="hint">{t("editHint")}</p>
            <div className="actions">
              <button type="submit" className="btn primary">
                {t("editSave")}
              </button>
              <Link href={continueAnyway ? "/review?continue=1" : "/review"} className="btn quiet">
                {t("editCancel")}
              </Link>
            </div>
          </form>
        </main>
      );
    }
  }

  // R-REV-04: after "Again", the claim, its source excerpt and a link to the page.
  if (sp.recall && /^[0-9a-f-]{36}$/.test(sp.recall)) {
    const { data: card } = await db.from("card").select("claim_id").eq("id", sp.recall).eq("user_id", viewer.userId).maybeSingle();
    const { data: claim } = card
      ? await db.from("claim").select("text,page_id").eq("id", card.claim_id as string).eq("user_id", viewer.userId).single()
      : { data: null };
    const { data: cite } = card
      ? await db.from("citation").select("excerpt").eq("claim_id", card.claim_id as string).eq("user_id", viewer.userId).limit(1).maybeSingle()
      : { data: null };
    if (card && claim) {
      const excerpt = cite?.excerpt as string | undefined;
      return (
        <main className="review">
          {head}
          <article className="card">
            <div className="card-top">
              <span className="note">{t("recallNote")}</span>
            </div>
            <p className="q">{t("recall", { claim: keepFrenchSpaces(claim.text as string) })}</p>
            {excerpt ? (
              <blockquote>
                <span className="eyebrow">{t("excerpt")}</span>
                <q>{excerpt}</q>
              </blockquote>
            ) : null}
            {viewer.via === "session" ? (
              <p>
                <Link href={`/pages/${claim.page_id as string}`}>{t("openPage")}</Link>
              </p>
            ) : null}
          </article>
          <Link href={continueAnyway ? "/review?continue=1" : "/review"} className="btn primary wide">
            {t("next")}
          </Link>
          {viewer.via === "session" ? cardTools(t, sp.recall, continueAnyway) : null}
        </main>
      );
    }
  }

  const next = await nextCard(db, viewer.userId, new Date(), { continueAnyway });

  if (next.kind === "done") {
    return (
      <main className="review">
        {head}
        <div className="empty">
          <p className="giant" aria-hidden="true" style={{ "--digits": 1 } as CSSProperties}>
            {0}
          </p>
          <p>{t("done")}</p>
          {viewer.via === "session" ? <Link href="/">{(await getTranslations("nav"))("home")}</Link> : null}
        </div>
      </main>
    );
  }
  if (next.kind === "budget_reached") {
    return (
      <main className="review">
        {head}
        <div className="empty">
          <p>{t("budgetReached")}</p>
          <div className="actions">
            <Link href="/review?continue=1" className="btn">
              {t("continueAnyway")}
            </Link>
            {viewer.via === "session" ? (
              <Link href="/" className="btn quiet">
                {t("stop")}
              </Link>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  const { card, isNew } = next;
  const { data: origin } = await db.from("claim").select("origin,page_id,page:page(title)").eq("id", card.claim_id).eq("user_id", viewer.userId).single();
  const topic = (origin?.page as unknown as { title: string } | null)?.title;
  const showAnswer = sp.show === "1";
  // R-SCH-07: when each grade would bring the card back, from the same scheduler that stores the result.
  const locale = await getLocale();
  const intervals = showAnswer
    ? previewIntervals(card.state as Parameters<typeof previewIntervals>[0], new Date(), (await loadProfile(db, viewer.userId)).desired_retention)
    : null;
  return (
    <main className="review">
      {head}
      <article className="card">
        <div className="card-top">
          {topic ? (
            <span className="note" data-testid="topic-name">
              {keepFrenchSpaces(topic)}
            </span>
          ) : null}
          <span className="note" data-testid="progress">
            {t("progress", { n: next.progress.n, total: next.progress.total })}
          </span>
          {isNew ? (
            <span className="tag" data-testid="new-badge">
              {t("newBadge")}
            </span>
          ) : null}
          {origin?.origin === "model" ? (
            <span className="note" data-testid="model-badge">
              {t("badgeModel")}
            </span>
          ) : null}
        </div>
        <p data-testid="question" className="q">
          {keepFrenchSpaces(card.question)}
        </p>
        {showAnswer ? (
          <p data-testid="answer" className="a">
            <span className="lab">{t("answer")}</span> {keepFrenchSpaces(card.answer)}
          </p>
        ) : null}
      </article>
      {showAnswer ? (
        <>
          {/* One form per grade; signal lays them out 2x2 on a phone, revue as a joined row. The interval (R-SCH-07) stays
              visible on a phone, where the hint is hidden. */}
          <div className="grades">
            {GRADES.map(({ grade, key }) => (
              <form action={gradeCard} key={grade}>
                <input type="hidden" name="card_id" value={card.card_id} />
                <input type="hidden" name="grade" value={grade} />
                <input type="hidden" name="shown_at" value={String(new Date().getTime())} />
                {continueAnyway ? <input type="hidden" name="continue" value="1" /> : null}
                <button type="submit" data-grade={grade} className="grade">
                  <b>{t(key)}</b> <small>{t(`${key}Hint`)}</small>
                  {intervals ? (
                    <>
                      <span className="iv" data-testid="interval" aria-hidden="true">
                        {formatInterval(intervals[grade], locale)}
                      </span>
                      <span className="visually-hidden">{`, ${formatInterval(intervals[grade], locale, "long")}`}</span>
                    </>
                  ) : null}
                </button>
              </form>
            ))}
          </div>
          <p className="hint" data-testid="forgot-note">
            {t("forgotNote", { again: t("again"), hard: t("hard") })}
          </p>
        </>
      ) : (
        <Link href={continueAnyway ? "/review?show=1&continue=1" : "/review?show=1"} className="btn primary wide" data-testid="show-answer">
          {t("show")}
        </Link>
      )}
      {viewer.via === "session" ? (
        <>
          {showAnswer && origin?.page_id ? (
            <p>
              <Link href={`/pages/${origin.page_id as string}`} data-testid="open-topic">
                {t("openPage")}
              </Link>
            </p>
          ) : null}
          {cardTools(t, card.card_id, continueAnyway)}
        </>
      ) : null}
    </main>
  );
}
