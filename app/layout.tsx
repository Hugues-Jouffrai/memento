import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { sessionViewer } from "@/server/viewer";
import { pickStyle, STYLE_COOKIE, THEME_COLORS } from "@/ui/style";
import { NavBar } from "./nav-bar";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return { title: t("name"), description: t("tagline") };
}

export async function generateViewport(): Promise<Viewport> {
  const colors = THEME_COLORS[pickStyle((await cookies()).get(STYLE_COOKIE)?.value)];
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: colors.light },
      { media: "(prefers-color-scheme: dark)", color: colors.dark },
    ],
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const style = pickStyle((await cookies()).get(STYLE_COOKIE)?.value);
  const signedIn = (await sessionViewer()) !== null;
  return (
    <html lang={locale} data-style={style}>
      <body className={signedIn ? "shell signed-in" : "shell"}>
        <NextIntlClientProvider>
          {signedIn ? <NavBar /> : null}
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
