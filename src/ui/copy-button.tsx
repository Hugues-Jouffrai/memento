"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

/** Copies a short text (the capture address) to the clipboard and says so for two seconds. */
export function CopyButton({ text }: { text: string }) {
  const t = useTranslations("home");
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="linkish copy"
      data-testid="copy-address"
      aria-live="polite"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard refused (permissions, insecure context): the address stays selectable by hand.
        }
      }}
    >
      {copied ? t("copied") : t("copy")}
    </button>
  );
}
