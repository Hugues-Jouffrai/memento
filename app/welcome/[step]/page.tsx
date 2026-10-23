import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { tryMailto } from "@/domain/onboarding";
import { parseWelcomeStep, welcomeNav, WELCOME_STEPS } from "@/domain/welcome";
import { loadHelpContext } from "@/server/help-context";
import { sessionViewer } from "@/server/viewer";
import { CopyButton } from "@/ui/copy-button";
import { completeWelcome } from "../actions";

/**
 * R-ONB-08: one screen of the first-sign-in walkthrough. The body text is the `help` text (R-ONB-10): the same
 * messages with the same arguments as `/help`, so there is no second copy that can drift.
 */
export default async function WelcomeStep({ params }: { params: Promise<{ step: string }> }) {
  const step = parseWelcomeStep((await params).step);
  if (step === null) notFound();
  const viewer = await sessionViewer();
  if (!viewer) redirect("/login");
  const { address, args } = await loadHelpContext(viewer.userId);
  const t = await getTranslations("help");
  const tWelcome = await getTranslations("welcome");
  const tOnboarding = await getTranslations("onboarding");
  const nav = welcomeNav(step);

  return (
    <main className="help welcome" data-testid="welcome" data-step={step}>
      <div className="kicker">
        <h1>{tWelcome(`title${step}` as "title1")}</h1>
        <p className="muted" data-testid="welcome-progress">
          {tWelcome("progress", { step, total: WELCOME_STEPS })}
        </p>
      </div>

      {step === 1 ? <p className="lede">{t("intro")}</p> : null}
      {step === 2 ? (
        <>
          <p>{t("send.address", args)}</p>
          <div className="addr">
            <code className="address" data-testid="welcome-address">
              {address}
            </code>
            <CopyButton text={address} />
          </div>
          <p>{t("send.what", args)}</p>
          <p>{t("send.receipt")}</p>
        </>
      ) : null}
      {step === 3 ? (
        <>
          <p>{t("tray.keep", args)}</p>
          <p>{t("tray.badge", args)}</p>
        </>
      ) : null}
      {step === 4 ? (
        <>
          <p>{t("review.grades", args)}</p>
          <p>{t("review.forgot", args)}</p>
          <p>{t("review.budget", args)}</p>
          <p>{t("reminder.when", args)}</p>
        </>
      ) : null}
      {step === 5 ? (
        <>
          <p>
            <a className="btn primary" data-testid="welcome-try" href={tryMailto(address, tOnboarding("sampleSubject"), tOnboarding("sampleBody"))}>
              {t("send.try")}
            </a>
          </p>
          <p className="note">{t("send.tryHint")}</p>
        </>
      ) : null}

      <nav className="actions" aria-label={tWelcome("navLabel")}>
        {nav.prev ? (
          <Link className="btn" href={`/welcome/${nav.prev}`} data-testid="welcome-back">
            {tWelcome("back")}
          </Link>
        ) : null}
        {nav.next ? (
          <Link className="btn primary" href={`/welcome/${nav.next}`} data-testid="welcome-next">
            {tWelcome("next")}
          </Link>
        ) : null}
        {step === WELCOME_STEPS ? (
          <form action={completeWelcome}>
            <button type="submit" className="btn primary" data-testid="welcome-finish">
              {tWelcome("finish")}
            </button>
          </form>
        ) : (
          <form action={completeWelcome}>
            <button type="submit" className="linkish" data-testid="welcome-skip">
              {tWelcome("skip")}
            </button>
          </form>
        )}
      </nav>
    </main>
  );
}
