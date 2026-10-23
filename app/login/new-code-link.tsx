"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/** "Recevoir un nouveau code": a plain link (works without JavaScript) that, with JavaScript, waits out Auth's one-minute resend limit. */
export function NewCodeLink({ seconds }: { seconds: number }) {
  const t = useTranslations("login");
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  if (left > 0) {
    return (
      <span data-testid="new-code-wait" role="link" aria-disabled="true">
        {t("newCodeWait", { seconds: left })}
      </span>
    );
  }
  return (
    <a href="/login" data-testid="new-code-link">
      {t("newCode")}
    </a>
  );
}
