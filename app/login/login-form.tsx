"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { requestCode, verifyCode, verifyEmailAndCode, type LoginState } from "./actions";

export function LoginForm({ step }: { step: "email" | "code" | "both" }) {
  const t = useTranslations("login");
  const [state, action, pending] = useActionState<LoginState, FormData>(step === "email" ? requestCode : step === "both" ? verifyEmailAndCode : verifyCode, {});
  return (
    <form action={action} className="stack">
      {step === "email" || step === "both" ? (
        <label className="field">
          {t("emailLabel")}
          <input name="email" type="email" autoComplete="email" required />
        </label>
      ) : null}
      {step !== "email" ? (
        <>
          {step === "code" ? <p className="note">{t("codeSent")}</p> : null}
          <label className="field">
            {t("codeLabel")}
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required />
          </label>
        </>
      ) : null}
      {state.error ? <p role="alert">{t(`error.${state.error}`, { seconds: state.seconds ?? 60 })}</p> : null}
      <button type="submit" disabled={pending} className="btn primary wide">
        {step === "email" ? t("sendCode") : t("verify")}
      </button>
    </form>
  );
}
