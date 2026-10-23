import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { readWaitlistToken } from "@/server/waitlist";
import { leaveAction } from "./actions";

// "same-origin", not "no-referrer": see the confirm page (Origin: null breaks the form POST).
export const metadata = { robots: { index: false, follow: false }, referrer: "same-origin" as const };

/** R-LAND-07: a GET never writes; the button posts. The answer does not tell whether the address was listed. */
export default async function LeavePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; failed?: string }> }) {
  const { token } = await params;
  const { done, failed } = await searchParams;
  const t = await getTranslations("waitlist");
  const tApp = await getTranslations("app");
  const data = readWaitlistToken("leave", token, process.env.REVIEW_LINK_SECRET);
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
              <h1>{t("leave.title")}</h1>
            </div>
            {done ? (
              <p data-testid="waitlist-done">{t("leave.done")}</p>
            ) : (
              <>
                {failed ? <p role="alert">{t("failed")}</p> : null}
                <p>{t("leave.question", { email: data.email })}</p>
                <form action={leaveAction.bind(null, token)}>
                  <button type="submit" className="btn primary wide">
                    {t("leave.button")}
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
