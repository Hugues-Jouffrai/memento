import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { withBrand } from "@/config/brand";
import { pickLocale } from "./locale";

export default getRequestConfig(async () => {
  const locale = pickLocale((await cookies()).get("locale")?.value);
  // R-OPS-03: `{brand}` is filled here, before next-intl sees the messages (next-intl 4 has no global default values).
  return { locale, messages: withBrand((await import(`../../messages/${locale}.json`)).default) };
});
