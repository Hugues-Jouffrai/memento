import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";
import { SHARED_LOCAL_PART } from "@/domain/capture";
import { needsWelcome } from "@/domain/welcome";
import { localDate } from "@/domain/time";
import { appUrl, receivingDomain } from "@/server/config";
import { summarize } from "@/server/review-queue";
import { sessionViewer } from "@/server/viewer";
import { createSessionClient } from "@/supabase/server";
import { CopyButton } from "@/ui/copy-button";
import { FirstRun } from "./first-run";
import { Landing } from "./landing";

/** R-LAND-01: signed-out visitors see the landing page, signed-in users their home page. */
export default async function RootPage({ searchParams }: { searchParams: Promise<{ notify?: string }> }) {
  const viewer = await sessionViewer();
  if (!viewer) return <Landing notify={(await searchParams).notify} />;
  return <Home userId={viewer.userId} />;
}

/** R-LAND-12: link previews of the landing page. noindex while the name is a temporary label (D49). */
export async function generateMetadata(): Promise<Metadata> {
  const tApp = await getTranslations("app");
  const t = await getTranslations("landing");
  const locale = await getLocale();
  const title = `${tApp("name")} – ${tApp("tagline")}`;
  const description = t("metaDescription");
  return {
    metadataBase: new URL(appUrl()),
    title,
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      url: "/",
      siteName: tApp("name"),
      title,
      description,
      locale: locale === "fr" ? "fr_FR" : "en_US",
      images: [{ url: "/icon.png", width: 192, height: 192, alt: tApp("name") }],
    },
    twitter: { card: "summary", title, description, images: ["/icon.png"] },
  };
}

/** R-DASH-01: today's load, the tray size and the next 7 days. */
async function Home({ userId }: { userId: string }) {
  const t = await getTranslations("home");
  const format = await getFormatter();
  const supabase = await createSessionClient();
  const now = new Date();
  const [{ data: addr }, summary, { data: states }, { data: welcome }] = await Promise.all([
    supabase.from("capture_address").select("token").maybeSingle(),
    summarize(supabase, userId, now),
    supabase.from("fsrs_state").select("due,state"),
    supabase.from("profile").select("welcome_done_at").eq("user_id", userId).single(),
  ]);
  // R-ONB-07: a new account meets the walkthrough here and nowhere else.
  if (needsWelcome(welcome?.welcome_done_at as string | null | undefined)) redirect("/welcome/1");

  const tz = summary.profile.timezone;
  const days = Array.from({ length: 7 }, (_, i) => localDate(new Date(now.getTime() + i * 86_400_000), tz));
  const load = new Map(days.map((d) => [d, 0]));
  for (const s of states ?? []) {
    const d = localDate(new Date(s.due as string), tz);
    if (load.has(d)) load.set(d, (load.get(d) ?? 0) + 1);
    else if (d < days[0]!) load.set(days[0]!, (load.get(days[0]!) ?? 0) + 1); // overdue counts today
  }
  const receiving = receivingDomain();
  const due = summary.dueReviews + summary.newToday;

  // R-CAP-12: the shared address first; the token address stays as a fallback for providers whose DKIM is not `pass`.
  const tokenAddress = addr ? (receiving ? `${addr.token as string}@${receiving}` : (addr.token as string)) : null;
  const address = receiving ? `${SHARED_LOCAL_PART}@${receiving}` : tokenAddress;
  const fallback = receiving ? tokenAddress : null;

  // Layout wrappers (home-grid, lead-col, side, box) are plain wrappers in the base look;
  // revue and signal turn them into columns. The giant numeral and the date only show in some styles.
  return (
    <main className="home">
      <div className="kicker">
        <h1>{t("title")}</h1>
        <time className="date" dateTime={days[0]}>
          {format.dateTime(now, { weekday: "long", day: "numeric", month: "long", timeZone: tz })}
        </time>
      </div>

      {address ? <FirstRun userId={userId} address={address} /> : null}

      <div className="home-grid">
        <div className="lead-col">
          <section className="today" aria-labelledby="today">
            <h2 id="today" className="visually-hidden">
              {t("today")}
            </h2>
            <p className="giant" aria-hidden="true" style={{ "--digits": String(due).length } as CSSProperties}>
              {due}
            </p>
            <p className="giant-label" aria-hidden="true">
              {t("dueLabel", { count: due })} <span>{t("newToday", { count: summary.newToday })}</span>
            </p>
            <p className="big" data-testid="due-today">
              {t("dueToday", { count: due })} {t("newToday", { count: summary.newToday })}
            </p>
            {due > 0 ? <p className="muted minutes">{t("minutes", { minutes: summary.minutes })}</p> : null}
            <p className="muted tray-line" data-testid="tray-count">
              {t("trayCount", { count: summary.trayCount })}
              {summary.trayCount > 0 ? (
                <>
                  {" · "}
                  <Link href="/tray">{t("openTray")}</Link>
                </>
              ) : null}
            </p>
          </section>
          {due > 0 ? (
            <Link href="/review" className="btn primary wide start">
              {t("startReview")}
            </Link>
          ) : null}
        </div>

        <div className="side">
          <section className="section">
            <h2>{t("next7")}</h2>
            <ol className="week">
              {[...load.entries()].map(([d, n]) => (
                <li key={d}>
                  <strong>{n}</strong>
                  <span className="box" aria-hidden="true">
                    <span className="col" style={{ "--n": n } as CSSProperties} />
                  </span>
                  <time dateTime={d}>{format.dateTime(new Date(`${d}T12:00:00Z`), { weekday: "short", day: "numeric", timeZone: "UTC" })}</time>
                </li>
              ))}
            </ol>
          </section>

          {address ? (
            <section className="section">
              <h2>{t("captureAddress")}</h2>
              <div className="addr">
                <code className="address" data-testid="capture-address">
                  {address}
                </code>
                <CopyButton text={address} />
              </div>
              <p className="note">{t("captureHint")}</p>
              {fallback ? (
                <>
                  <p className="muted alt-label">{t("captureFallback")}</p>
                  <code className="address alt" data-testid="capture-address-token">
                    {fallback}
                  </code>
                </>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
