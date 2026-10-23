import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { firstRunSteps, showFirstRun, tryMailto } from "@/domain/onboarding";
import { createSessionClient } from "@/supabase/server";
import { dismissOnboarding } from "./onboarding-actions";

/**
 * R-ONB-02: "First steps" checklist above the day's numbers. The ticks are computed from the user's data. It works
 * without JavaScript: hiding is a form post. Returns nothing when all steps are done or the user hid it.
 */
export async function FirstRun({ userId, address }: { userId: string; address: string }) {
  const supabase = await createSessionClient();
  const head = { count: "exact", head: true } as const;
  const [captures, kept, reviews, prof] = await Promise.all([
    supabase.from("capture").select("id", head),
    supabase.from("card").select("id", head).not("kept_at", "is", null),
    supabase.from("review_log").select("id", head),
    supabase.from("profile").select("onboarding_dismissed_at").eq("user_id", userId).single(),
  ]);
  const steps = firstRunSteps({ captures: captures.count ?? 0, keptCards: kept.count ?? 0, reviews: reviews.count ?? 0 });
  if (!showFirstRun(steps, (prof.data?.onboarding_dismissed_at as string | null) ?? null)) return null;

  const t = await getTranslations("onboarding");
  const tNav = await getTranslations("nav");
  const items = [
    { key: "capture", done: steps.capture, href: null },
    { key: "keep", done: steps.keep, href: "/tray" },
    { key: "review", done: steps.review, href: "/review" },
  ] as const;
  return (
    <section className="section first-run" aria-labelledby="first-run" data-testid="first-run">
      <h2 id="first-run">{t("title")}</h2>
      <ol>
        {items.map((i) => (
          <li key={i.key} data-done={i.done}>
            <span aria-hidden="true">{i.done ? "☑" : "☐"}</span>{" "}
            {i.href && !i.done ? <Link href={i.href}>{t(`step.${i.key}`)}</Link> : t(`step.${i.key}`)}{" "}
            <span className="muted">{i.done ? t("done") : t("todo")}</span>
          </li>
        ))}
      </ol>
      <p>
        <a className="btn primary" data-testid="first-run-try" href={tryMailto(address, t("sampleSubject"), t("sampleBody"))}>
          {t("tryNow")}
        </a>{" "}
        <Link href="/help">{t("help")}</Link>
      </p>
      <form action={dismissOnboarding}>
        <button type="submit" className="linkish">
          {t("hide")}
        </button>{" "}
        <small className="muted">{t("hideHint", { settings: tNav("settings") })}</small>
      </form>
    </section>
  );
}
