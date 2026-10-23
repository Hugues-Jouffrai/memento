import { BRAND, withBrand } from "@/config/brand";
import fr from "../../messages/fr.json";
import { renderMail } from "./mail-layout";

/**
 * The sign-in mail Supabase Auth sends (supabase/templates/magic_link.html), built from the same layout as every
 * other mail. Auth fills the Go-template placeholders. There is no token link on purpose: a mail scanner that opens
 * one uses up the code too (D57). The button is a plain link to the sign-in page. French only: Auth has no per-user language.
 * `scripts/build-auth-template.ts` writes the file; a unit test fails if the file and this function drift apart.
 */
export function magicLinkTemplate(): string {
  const m = withBrand(fr).email;
  return renderMail({
    brand: BRAND.name,
    lang: "fr",
    kicker: m.kicker.signin,
    title: m.signin.title,
    preview: m.signin.intro,
    blocks: [
      { p: m.signin.intro },
      { code: "{{ .Token }}" },
      { button: { label: m.signin.cta, url: "{{ .SiteURL }}/login" } },
      { small: m.signin.validity },
    ],
    footer: { text: m.footer },
  });
}
