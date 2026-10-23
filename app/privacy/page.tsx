import { getTranslations } from "next-intl/server";
import { WAITLIST_RETENTION_MONTHS } from "@/domain/waitlist";

const PROCESSORS = ["gemini", "supabase", "resend", "vercel", "cloudflare"] as const;

/** R-SEC-05: who handles what, in plain words. Public, no sign-in. */
export default async function PrivacyPage() {
  const t = await getTranslations("privacy");
  const tApp = await getTranslations("app");
  const tMail = await getTranslations("email.waitlist");
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
        <h2>{t("storeTitle")}</h2>
        <p>{t("store")}</p>
        <h2>{t("processorsTitle")}</h2>
        <ul>
          {PROCESSORS.map((p) => (
            <li key={p}>
              <strong>{t(`processors.${p}.name`)}</strong>{" : "}{t(`processors.${p}.role`)}
            </li>
          ))}
        </ul>
        <h2>{t("noTrainTitle")}</h2>
        <p>{t("noTrain")}</p>
        <h2>{t("yourRightsTitle")}</h2>
        <p>{t("yourRights")}</p>
        <h2 data-testid="privacy-waitlist">{t("waitlistTitle")}</h2>
        <p>{t("waitlist", { months: WAITLIST_RETENTION_MONTHS })}</p>
        <p>{t("waitlistRemove", { leaveLink: tMail("leaveLinkText") })}</p>
        <p>{t("waitlistAbuse")}</p>
        <h2>{t("contactTitle")}</h2>
        <p>{t("contact")}</p>
      </div>
    </main>
  );
}
