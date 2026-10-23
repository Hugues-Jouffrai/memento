import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { sessionViewer } from "@/server/viewer";
import { removeAccount } from "./actions";

export default async function DeleteAccountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await sessionViewer())) redirect("/login");
  const t = await getTranslations("account");
  const { error } = await searchParams;
  return (
    <main className="settings">
      <div className="kicker">
        <h1>{t("deleteTitle")}</h1>
      </div>
      <div className="sheet stack">
        <p>{t("deleteWarning")}</p>
        <p>
          <a href="/settings/export">{t("exportFirst")}</a>
        </p>
        {error === "mismatch" ? <p role="alert">{t("mismatch")}</p> : null}
        <form action={removeAccount} className="stack">
          <label className="field">
            {t("typeEmail")}
            <input name="email" type="email" autoComplete="off" required />
          </label>
          <button type="submit" className="btn wide">
            {t("deleteConfirm")}
          </button>
        </form>
        <p>
          <a href="/settings">{t("cancel")}</a>
        </p>
      </div>
    </main>
  );
}
