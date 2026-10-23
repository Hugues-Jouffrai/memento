"use client";

import { Wordmark } from "@/ui/logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const LINKS = [
  { href: "/", key: "home" },
  { href: "/tray", key: "tray" },
  { href: "/review", key: "review" },
  { href: "/pages", key: "pages" },
  { href: "/settings", key: "settings" },
] as const;

/** Bottom bar on a phone, top bar on a wider screen. Marks the current section for screen readers too. */
export function NavBar() {
  const t = useTranslations("nav");
  const tApp = useTranslations("app");
  const path = usePathname();
  const current = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav className="bar" aria-label={t("label")}>
      <Link href="/" className="brand">
        <Wordmark name={tApp("name")} />
      </Link>
      {LINKS.map(({ href, key }) => (
        <Link key={key} href={href} aria-current={current(href) ? "page" : undefined}>
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
