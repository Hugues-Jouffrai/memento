import { getTranslations } from "next-intl/server";
import { JoinForm } from "./join-form";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const t = await getTranslations("join");
  const tApp = await getTranslations("app");
  const tAccount = await getTranslations("account");
  return (
    <main className="login">
      <div className="kicker">
        <span>{tApp("name")}</span>
      </div>
      <div className="sheet stack">
        <div className="page-head">
          <h1>{t("title")}</h1>
          <p className="lede">{t("lede")}</p>
        </div>
        <JoinForm code={code} />
        <p className="note" data-testid="join-existing">
          {t("already")} <a href="/login">{t("loginLink")}</a>
        </p>
        <p className="note">
          <a href="/privacy">{tAccount("privacyLink")}</a>
        </p>
      </div>
    </main>
  );
}
