import { getTranslations } from "next-intl/server";
import { currentChoice, isReminderChoice, type ReminderChoice } from "@/domain/reminder-pref";
import { verifyUnsubscribeToken } from "@/server/review-token";
import { createAdminClient } from "@/supabase/admin";
import { chooseReminders } from "./actions";

const CHOICES: ReminderChoice[] = ["week", "month", "off", "on"];

export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const { done } = await searchParams;
  const t = await getTranslations("unsubscribe");
  const tApp = await getTranslations("app");
  const userId = verifyUnsubscribeToken(token, process.env.REVIEW_LINK_SECRET);
  const { data } = userId
    ? await createAdminClient().from("profile").select("reminders_off,reminders_paused_until").eq("user_id", userId).single()
    : { data: null };
  const current = data ? currentChoice(data, new Date()) : null;
  return (
    <main className="login">
      <div className="kicker">
        <span>{tApp("name")}</span>
      </div>
      <div className="sheet stack">
        <div className="page-head">
          <h1>{t("title")}</h1>
        </div>
        {!userId || !data ? (
          <p role="alert">{t("invalid")}</p>
        ) : (
          <>
            {isReminderChoice(done) ? <p data-testid="reminders-saved">{t(`done.${done}`)}</p> : null}
            <p className="note">{t(`state.${current!}`)}</p>
            <form action={chooseReminders.bind(null, token)} className="stack">
              {CHOICES.filter((c) => c !== current).map((c) => (
                <button key={c} type="submit" name="choice" value={c} className={c === "off" ? "btn wide" : "btn primary wide"}>
                  {t(`choice.${c}`)}
                </button>
              ))}
            </form>
          </>
        )}
      </div>
    </main>
  );
}
