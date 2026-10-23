import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { tryMailto } from "@/domain/onboarding";
import { loadHelpContext } from "@/server/help-context";
import { sessionViewer } from "@/server/viewer";
import { CopyButton } from "@/ui/copy-button";

/** R-ONB-01: five numbered sections. Every label, address, time and limit is an argument, never text (R-ONB-03). */
export default async function HelpPage() {
  const viewer = await sessionViewer();
  if (!viewer) redirect("/login");
  const { address, args } = await loadHelpContext(viewer.userId);
  const t = await getTranslations("help");
  const tOnboarding = await getTranslations("onboarding");
  const tWelcome = await getTranslations("welcome");
  const tAbout = await getTranslations("about");

  return (
    <main className="help">
      <div className="kicker">
        <h1>{t("title")}</h1>
      </div>
      <p className="lede">{t("intro")}</p>
      <ol className="help-sections">
        <li>
          <h2>{t("send.title")}</h2>
          <p>{t("send.address", args)}</p>
          <div className="addr">
            <code className="address" data-testid="help-address">
              {address}
            </code>
            <CopyButton text={address} />
          </div>
          <p>{t("send.what", args)}</p>
          <p>{t("send.receipt")}</p>
          <p>
            <a className="btn primary" data-testid="help-try" href={tryMailto(address, tOnboarding("sampleSubject"), tOnboarding("sampleBody"))}>
              {t("send.try")}
            </a>
          </p>
          <p className="note">{t("send.tryHint")}</p>
        </li>
        <li>
          <h2>{t("tray.title", args)}</h2>
          <p>{t("tray.keep", args)}</p>
          <p>{t("tray.badge", args)}</p>
        </li>
        <li>
          <h2>{t("review.title", args)}</h2>
          <p>{t("review.grades", args)}</p>
          <p>{t("review.forgot", args)}</p>
          <p>{t("review.budget", args)}</p>
          <p>{t("review.edit", args)}</p>
        </li>
        <li>
          <h2>{t("reminder.title")}</h2>
          <p>{t("reminder.when", args)}</p>
          <p>{t("reminder.link", args)}</p>
          <p>{t("reminder.pause", args)}</p>
        </li>
        <li>
          <h2>{t("pages.title", args)}</h2>
          <p>{t("pages.pages", args)}</p>
          <p>{t("pages.settings", args)}</p>
        </li>
      </ol>
      <p>
        <Link href="/welcome/1" data-testid="help-replay">
          {tWelcome("replay")}
        </Link>
      </p>
      <p>
        <Link href="/about" data-testid="help-about">
          {tAbout("helpLink")}
        </Link>
      </p>
    </main>
  );
}
