import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { VERIFIED_SOURCES, type AboutSource } from "@/config/about-sources";
import { ABOUT_SECTIONS } from "@/domain/about";
import { DEFAULT_RETENTION } from "@/domain/settings";
import { keepFrenchSpaces } from "@/ui/typography";

/** "Dunlosky et al. (2013)", or just "FSRS" for a page without a year. */
const shortName = (s: AboutSource) => (s.year ? `${s.short} (${s.year})` : s.short);

/** "Authors (year). Title. Venue." as recorded; the year and venue are left out when the source has none. */
const citation = (s: AboutSource) => `${s.authors}${s.year ? ` (${s.year})` : ""}. ${s.title}.${s.venue ? ` ${s.venue}.` : ""}`;

/**
 * R-ABOUT-01: public explainer of the learning theory behind the app (D65). Server rendered, no data access, no client
 * JavaScript. Words come from messages `about.*`; sources, roles and order from src/config/about-sources.ts and
 * src/domain/about.ts. Grade labels and the default retention are ICU arguments, never text (R-ABOUT-03, R-ABOUT-05).
 */
export default async function AboutPage() {
  const t = await getTranslations("about");
  const tReview = await getTranslations("review");
  const args = {
    again: tReview("again"),
    hard: tReview("hard"),
    good: tReview("good"),
    easy: tReview("easy"),
    retention: Math.round(DEFAULT_RETENTION * 100),
  };
  const tHelp = await getTranslations("help");
  const tPrivacy = await getTranslations("privacy");
  const sources = new Map(VERIFIED_SOURCES.map((s) => [s.id, s]));

  return (
    <main className="about">
      <div className="page-head">
        <h1>{t("title")}</h1>
        <p className="lede">{keepFrenchSpaces(t("lede"))}</p>
      </div>

      <ol className="reasons">
        {ABOUT_SECTIONS.map((s) => {
          const cited = s.sources.map((id) => sources.get(id)).filter((x): x is AboutSource => Boolean(x));
          return (
            <li key={s.id} className={`role-${s.role}`} data-testid={`about-${s.id}`}>
              <div>
                <h2>{keepFrenchSpaces(t(`sections.${s.id}.title`))}</h2>
                {s.blocks.map((role) => (
                  <div className="blk" key={role}>
                    <p className={`role-tag role-${role}`} data-role={role}>
                      {t(`roles.${role}`)}
                    </p>
                    <p>{keepFrenchSpaces(t(`sections.${s.id}.${role}`, args))}</p>
                  </div>
                ))}
                {cited.length > 0 ? (
                  <p className="srcs">
                    {keepFrenchSpaces(t("source"))}{" "}
                    {cited.map((src, i) => (
                      <span key={src.id}>
                        {i > 0 ? " · " : null}
                        <a href={`#src-${src.id}`}>{shortName(src)}</a>
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <section className="limits" aria-labelledby="h-limits">
        <h2 id="h-limits">{t("limitsTitle")}</h2>
        <p>{keepFrenchSpaces(t("limits"))}</p>
      </section>

      <section className="srclist" aria-labelledby="h-sources">
        <h2 id="h-sources">{t("sourcesTitle")}</h2>
        <ul>
          {VERIFIED_SOURCES.map((s) => (
            <li key={s.id} id={`src-${s.id}`}>
              {citation(s)}
              <br />
              <a href={s.url} data-testid="about-source-link">
                {s.url}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="xlinks">
        <Link href="/help">{tHelp("title")}</Link>
        <Link href="/privacy">{tPrivacy("title")}</Link>
      </p>
    </main>
  );
}
