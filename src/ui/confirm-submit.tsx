"use client";

import { useTranslations } from "next-intl";
import { useRef, type ReactNode } from "react";

/**
 * A submit button that asks first (R-TRAY-06). Without JavaScript it is a plain submit button, so the action still works.
 * With JavaScript the click opens a native dialog; "confirm" submits the form with this button as the submitter.
 */
export function ConfirmSubmit({
  formAction,
  count,
  className,
  children,
}: {
  formAction: (formData: FormData) => void | Promise<void>;
  count: number;
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations("tray");
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const confirmed = useRef(false);
  return (
    <>
      <button
        ref={button}
        type="submit"
        formAction={formAction}
        className={className}
        data-testid="discard-all"
        onClick={(e) => {
          if (confirmed.current) {
            confirmed.current = false;
            return;
          }
          e.preventDefault();
          dialog.current?.showModal();
        }}
      >
        {children}
      </button>
      <dialog ref={dialog} className="confirm" data-testid="confirm-dialog" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{t("confirmTitle")}</h2>
        <p>{t("confirmBody", { count })}</p>
        <div className="actions">
          <button type="button" className="btn" data-testid="confirm-cancel" onClick={() => dialog.current?.close()}>
            {t("confirmCancel")}
          </button>
          <button
            type="button"
            className="btn quiet"
            data-testid="confirm-ok"
            onClick={() => {
              dialog.current?.close();
              confirmed.current = true;
              button.current?.form?.requestSubmit(button.current);
            }}
          >
            {t("discardAll")}
          </button>
        </div>
      </dialog>
    </>
  );
}
