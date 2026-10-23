import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { withBrand } from "@/config/brand";

/** Messages for mails built outside a request (receipts, reminders), with `{brand}` filled in (R-OPS-03). */
export const MAIL_MESSAGES = { fr: withBrand(fr), en: withBrand(en) } as const;
