import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { leaveUrlFor, readWaitlistToken } from "@/server/waitlist";
import { confirmAction } from "./actions";

// "same-origin", not "no-referrer": with no-referrer the browser sends `Origin: null` on the form POST and Next refuses the action.
// Nothing is sent to other sites either way, so the token in the path still never leaves the host.
export const metadata = { robots: { index: false, follow: false }, referrer: "same-origin" as const };

/** R-LAND-04: a GET never writes (mail scanners open links); the button posts. */
export default async function ConfirmPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; failed?: string }> }) {
  const { token } = await params;
  const { done, failed } = await searchParams;
  const t = await getTranslations("waitlist");
  const tApp = await getTranslations("app");
  const secret = process.env.REVIEW_LINK_SECRET;
  const data = readWaitlistToken("confirm", token, secret);
  return (
    <main className="login">
      <div className="kicker">
        <span>{tApp("name")}</span>
      </div>
      <div className="sheet stack">
        {!data ? (
          <>
            <p role="alert" data-testid="waitlist-invalid">
              {t("invalid")}
            </p>
            <p>
              <Link href="/" prefetch={false}>{t("home")}</Link>
            </p>
          </>
        ) : (
          <>
            <div className="page-head">
              <h1>{t("confirm.title")}</h1>
            </div>
            {done ? (
              <>
                <p data-testid="waitlist-done">{t("confirm.done")}</p>
                <p>
                  <a href={leaveUrlFor("", data.email, data.locale, secret)}>{t("leaveLink")}</a>
                </p>
              </>
            ) : (
              <>
                {failed ? <p role="alert">{t("failed")}</p> : null}
                <p>{t("confirm.question", { email: data.email })}</p>
                <form action={confirmAction.bind(null, token)}>
                  <button type="submit" className="btn primary wide">
                    {t("confirm.button")}
                  </button>
                </form>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
