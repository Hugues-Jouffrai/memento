import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { DEFAULT_RESEND_SECONDS } from "@/server/auth";
import { LoginForm } from "./login-form";
import { NewCodeLink } from "./new-code-link";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ step?: string; error?: string; deleted?: string }> }) {
  const t = await getTranslations("login");
  const tApp = await getTranslations("app");
  const tAccount = await getTranslations("account");
  const { step, error, deleted } = await searchParams;
  // An old mail whose link was already used: its code died with it, so ask for a new one (D57). A code step without
  // the pending-address cookie (another tab or browser) asks for address and code together instead of bouncing.
  const hasPending = (await cookies()).has("login_email");
  const formStep = error === "link" ? "email" : step === "code" ? (hasPending ? "code" : "both") : "email";
  return (
    <main className="login">
      <div className="kicker">
        <span>{tApp("name")}</span>
      </div>
      <div className="sheet stack">
        <div className="page-head">
          <h1>{t("title")}</h1>
          <p className="lede">{tApp("tagline")}</p>
        </div>
        {error === "link" ? <p role="alert">{t("error.link")}</p> : null}
        {deleted ? <p data-testid="account-deleted">{tAccount("deleted")}</p> : null}
        {formStep === "both" ? <p className="note">{t("noAddress")}</p> : null}
        <LoginForm key={formStep} step={formStep} />
        {formStep !== "email" ? (
          <p className="note">
            {formStep === "code" ? (
              <NewCodeLink seconds={DEFAULT_RESEND_SECONDS} />
            ) : (
              <a href="/login" data-testid="new-code-link">
                {t("newCode")}
              </a>
            )}
          </p>
        ) : null}
        <p className="note">
          <a href="/privacy">{tAccount("privacyLink")}</a>
        </p>
      </div>
    </main>
  );
}
