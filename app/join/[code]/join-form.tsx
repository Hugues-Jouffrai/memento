"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { join, type JoinState } from "./actions";

export function JoinForm({ code }: { code: string }) {
  const t = useTranslations("join");
  const [state, action, pending] = useActionState<JoinState, FormData>(join.bind(null, code), {});
  return (
    <form action={action} className="stack">
      <label className="field">
        {t("emailLabel")}
        <input name="email" type="email" autoComplete="email" required />
      </label>
      {state.error ? <p role="alert">{t(`error.${state.error}`)}</p> : null}
      <button type="submit" disabled={pending} className="btn primary wide">
        {t("submit")}
      </button>
    </form>
  );
}
