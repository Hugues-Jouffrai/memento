import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentChoice, REMINDER_CHOICES } from "@/domain/reminder-pref";
import { DAILY_MINUTES, MAX_NEW_CARDS_LIMIT, RETENTION_MAX, RETENTION_MIN } from "@/domain/settings";
import { loadProfile } from "@/server/review-queue";
import { sessionViewer } from "@/server/viewer";
import { createSessionClient } from "@/supabase/server";
import { pickStyle, STYLE_COOKIE, STYLES } from "@/ui/style";
import { setStyle } from "../style-actions";
import { signOut } from "../login/actions";
import { saveSettings } from "./actions";

type SearchParams = Promise<{ saved?: string; error?: string }>;

/** 0 = Sunday ... 6 = Saturday; shown Monday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

/**
 * R-ACC-08, R-ACC-09, D58: one form (reviews, reminders, language, advanced) with one save button, then the look
 * (applies at once), help, the data menu (closed) and the account. Server rendered; pills are native radios and
 * checkboxes, the menus are native `<details>`.
 */
export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await sessionViewer();
  if (!viewer) redirect("/login");
  const sp = await searchParams;
  const t = await getTranslations("settings");
  const tStyle = await getTranslations("style");
  const tAccount = await getTranslations("account");
  const tHelp = await getTranslations("help");
  const tAbout = await getTranslations("about");
  const tWelcome = await getTranslations("welcome");
  const style = pickStyle((await cookies()).get(STYLE_COOKIE)?.value);
  const supabase = await createSessionClient();
  const { data: auth } = await supabase.auth.getUser();
  const p = await loadProfile(supabase, viewer.userId);
  const { data: pref } = await supabase.from("profile").select("reminders_off,reminders_paused_until").eq("user_id", viewer.userId).single();
  const reminders = currentChoice(pref ?? { reminders_off: false, reminders_paused_until: null }, new Date());
  const errors = (sp.error ?? "").split(",").filter(Boolean);
  const advancedOpen = errors.includes("desired_retention") || errors.includes("timezone");

  return (
    <main className="settings">
      <div className="kicker">
        <h1>{t("title")}</h1>
      </div>
      {sp.saved ? (
        <p role="status" data-testid="settings-saved">
          {t("saved")}
        </p>
      ) : null}
      {errors.length ? (
        <p role="alert" data-testid="settings-error">
          {errors.map((e) => t(`errors.${e}` as "errors.daily_minutes")).join(" ")}
        </p>
      ) : null}

      <form action={saveSettings} className="stack" data-testid="settings-form">
        <section className="group" aria-labelledby="g-review">
          <h2 id="g-review">{t("groups.review")}</h2>
          <fieldset className="pill-set">
            <legend>{t("dailyMinutes")}</legend>
            {DAILY_MINUTES.map((m) => (
              <label key={m} className="pill">
                <input type="radio" name="daily_minutes" value={m} defaultChecked={m === p.daily_minutes} />
                <span>{t("minutesOption", { minutes: m })}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="pill-set">
            <legend>{t("studyDays")}</legend>
            {WEEK.map((d) => (
              <label key={d} className="pill">
                <input type="checkbox" name="study_day" value={d} defaultChecked={p.study_days.includes(d)} />
                <span>{t(`weekday.${d}` as "weekday.0")}</span>
              </label>
            ))}
          </fieldset>
          <p>
            <label className="inline-field">
              {t("maxNewCards")}
              <input type="number" name="max_new_cards" min={0} max={MAX_NEW_CARDS_LIMIT} step={1} defaultValue={p.max_new_cards} />
            </label>
          </p>
        </section>

        <section className="group" aria-labelledby="g-reminders" data-testid="reminders-group">
          <h2 id="g-reminders">{t("reminders.label")}</h2>
          <fieldset className="pill-set">
            <legend className="visually-hidden">{t("reminders.label")}</legend>
            {REMINDER_CHOICES.map((c) => (
              <label key={c} className="pill">
                <input type="radio" name="reminders" value={c} defaultChecked={c === reminders} />
                <span>{t(`reminders.${c}` as "reminders.on")}</span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="group" aria-labelledby="g-language">
          <h2 id="g-language">{t("language")}</h2>
          <fieldset className="pill-set">
            <legend className="visually-hidden">{t("language")}</legend>
            {(["fr", "en"] as const).map((l) => (
              <label key={l} className="pill">
                <input type="radio" name="language" value={l} defaultChecked={l === p.language} />
                <span>{t(l === "fr" ? "languageFr" : "languageEn")}</span>
              </label>
            ))}
          </fieldset>
        </section>

        <details className="menu" open={advancedOpen} data-testid="advanced-section">
          <summary>{t("advanced")}</summary>
          <p>
            <label className="inline-field">
              {t("desiredRetention")}
              <input type="number" name="desired_retention" min={RETENTION_MIN} max={RETENTION_MAX} step={0.01} defaultValue={p.desired_retention.toFixed(2)} />
            </label>
            <small>{t("retentionHint", { min: RETENTION_MIN.toFixed(2), max: RETENTION_MAX.toFixed(2) })}</small>
          </p>
          <p>
            <label className="inline-field">
              {t("timezone")}
              <input type="text" name="timezone" defaultValue={p.timezone} maxLength={64} />
            </label>
            <small>{t("timezoneHint")}</small>
          </p>
        </details>

        <button type="submit" className="btn primary wide">
          {t("save")}
        </button>
      </form>

      <form action={setStyle} className="group" data-testid="style-form" aria-labelledby="g-style">
        <h2 id="g-style">{t("groups.appearance")}</h2>
        <fieldset>
          <legend className="visually-hidden">{tStyle("label")}</legend>
          {STYLES.map((s) => (
            <button key={s} type="submit" name="style" value={s} className="linkish" aria-pressed={s === style}>
              {tStyle(s)}
            </button>
          ))}
        </fieldset>
      </form>

      <section className="group" aria-labelledby="g-help">
        <h2 id="g-help">{t("groups.help")}</h2>
        <p>
          <Link href="/help" data-testid="settings-help-link">
            {tHelp("title")}
          </Link>
        </p>
        <p>
          <Link href="/about" data-testid="settings-about-link">
            {tAbout("title")}
          </Link>
        </p>
        <p>
          <Link href="/welcome/1" data-testid="settings-replay-link">
            {tWelcome("replay")}
          </Link>
        </p>
      </section>

      <details className="menu" data-testid="data-section">
        <summary>{tAccount("exportTitle")}</summary>
        <p>
          <a href="/settings/export" data-testid="export-link">
            {tAccount("export")}
          </a>
          <br />
          <small>{tAccount("exportHint")}</small>
        </p>
        <p>
          <Link href="/settings/delete" data-testid="delete-link">
            {tAccount("delete")}
          </Link>
        </p>
        <p>
          <Link href="/privacy">{tAccount("privacyLink")}</Link>
        </p>
      </details>

      <form action={signOut} className="group" data-testid="signout-form" aria-labelledby="g-account">
        <h2 id="g-account">{t("groups.account")}</h2>
        <p>
          <span data-testid="whoami">{tAccount("signedIn", { email: auth.user?.email ?? "" })}</span>
        </p>
        <button type="submit" className="btn wide">
          {tAccount("signOut")}
        </button>
      </form>
    </main>
  );
}
