import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { createSessionClient } from "@/supabase/server";

export default async function PagesList() {
  const t = await getTranslations("pages");
  const tHelp = await getTranslations("help");
  const format = await getFormatter();
  const supabase = await createSessionClient();
  const { data } = await supabase.from("page").select("id,title,created_at").order("created_at", { ascending: false });
  return (
    <main className="pages">
      <div className="page-head">
        <h1>{t("title")}</h1>
        {data?.length ? <p className="lede">{t("count", { count: data.length })}</p> : null}
      </div>
      {data?.length ? (
        <ul className="index">
          {data.map((p) => (
            <li key={p.id as string}>
              <Link href={`/pages/${p.id}`}>
                <span className="t">{p.title as string}</span>
                <time className="date" dateTime={p.created_at as string}>
                  {format.dateTime(new Date(p.created_at as string), { day: "numeric", month: "short" })}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">
          {t("empty")}
          <span className="note">{t("emptyHint")}</span>
          <a href="/help" data-testid="empty-help-link">{tHelp("title")}</a>
        </p>
      )}
    </main>
  );
}
