import { Logo } from "@/ui/logo";
import { Fragment } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { isNotifyState } from "@/domain/waitlist";
import { joinWaitlist, setVisitorLocale } from "./landing-actions";

const STEPS = ["send", "sort", "review"] as const;
const DIFF = ["choose", "sources", "reminder", "budget"] as const;

/**
 * R-LAND-01..03, R-LAND-10: the page a signed-out visitor sees at /. Server-rendered, plain links and forms, no client
 * component, no third-party resource. Its strings describe the product and never quote the app (see landing-spec.md).
 */
export async function Landing({ notify }: { notify: string | undefined }) {
  const t = await getTranslations("landing");
  const tApp = await getTranslations("app");
  const tLogin = await getTranslations("login");
  const tAccount = await getTranslations("account");
  const tAbout = await getTranslations("about");
  const tSettings = await getTranslations("settings");
  const locale = await getLocale();
  const other = locale === "fr" ? "en" : "fr";
  const state = isNotifyState(notify) ? notify : null;

  return (
    <main className="landing" data-testid="landing">
      <header className="landing-head">
        <Logo className="logo" />
        <span className="brand">{tApp("name")}</span>
      </header>

      <h1>
        {tApp("tagline")
          .split(" ")
          .map((word, i) => (
            <Fragment key={i}>
              {i > 0 ? " " : null}
              <span className="nb">{word}</span>
            </Fragment>
          ))}
      </h1>
      <p className="lede">{t("hook")}</p>

      <section id="notify" aria-labelledby="notify-title">
        <h2 id="notify-title">{t("notify.title")}</h2>
        <p>{t("notify.lede")}</p>
        {state ? (
          <p role={state === "sent" ? "status" : "alert"} data-testid="notify-status">
            {t(`notify.status.${state}`)}
          </p>
        ) : null}
        <form action={joinWaitlist} className="stack">
          <label className="field">
            {tLogin("emailLabel")}
            <input name="email" type="email" autoComplete="email" required maxLength={254} />
          </label>
          <div className="hp" aria-hidden="true">
            <label>
              {t("notify.honeypot")}
              <input name="hp_note" type="text" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <button type="submit" className="btn primary wide">
            {t("notify.submit")}
          </button>
        </form>
        <p className="consent">{t.rich("notify.consent", { link: (chunks) => <a href="/privacy">{chunks}</a> })}</p>
        <p className="already">
          <a href="/login">{t("already")}</a>
        </p>
      </section>

      <section aria-labelledby="steps-title">
        <h2 id="steps-title">{t("steps.title")}</h2>
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s}>
              <h3>{t(`steps.${s}.title`)}</h3>
              <p>{t(`steps.${s}.text`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="diff-title">
        <h2 id="diff-title">{t("diff.title")}</h2>
        <ul className="diff">
          {DIFF.map((d) => (
            <li key={d}>{t(`diff.${d}`)}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="beta-title">
        <h2 id="beta-title">{t("beta.title")}</h2>
        <p>{t("beta.text")}</p>
        <p className="beta-link">
          <a href="/privacy">{t("beta.privacyLink")}</a>
        </p>
      </section>

      <footer className="landing-foot">
        <ul>
          <li>
            <a href="/login">{tLogin("title")}</a>
          </li>
          <li>
            <a href="/about" data-testid="landing-about-link">{tAbout("title")}</a>
          </li>
          <li>
            <a href="/privacy">{tAccount("privacyLink")}</a>
          </li>
        </ul>
        <form action={setVisitorLocale}>
          <button type="submit" name="locale" value={other} lang={other}>
            {other === "en" ? tSettings("languageEn") : tSettings("languageFr")}
          </button>
        </form>
      </footer>
    </main>
  );
}
