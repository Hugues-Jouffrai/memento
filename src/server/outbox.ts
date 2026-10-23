import { withHelpLine, type Lang } from "./emails";
import type { OutboundMail, PipelineDeps } from "./ports";

export async function recipient(deps: PipelineDeps, userId: string): Promise<{ email: string; lang: Lang }> {
  const { data: u } = await deps.db.auth.admin.getUserById(userId);
  const { data: p } = await deps.db.from("profile").select("language").eq("user_id", userId).single();
  if (!u.user?.email) throw new Error(`user ${userId} has no email`);
  return { email: u.user.email, lang: (p?.language as Lang) ?? "fr" };
}

export interface SendOnce {
  userId: string;
  kind: "receipt" | "reminder" | "quota";
  /** Unique per (user, kind): a repeat is a no-op, so "running the job twice sends once" (R-NOT-03). */
  dedupKey: string;
  build: (lang: Lang) => Omit<OutboundMail, "to">;
}

/** Logs the mail in `email_out` first, then sends it; a mail already `sent` is never sent again. */
export async function sendEmailOnce(deps: PipelineDeps, o: SendOnce): Promise<void> {
  const { email, lang } = await recipient(deps, o.userId);
  let mail = o.build(lang);
  if (o.kind === "receipt") {
    // R-ONB-06: only the user's first receipt links to /help. Rows of other keys count; a retry of the same receipt keeps its link.
    const { count } = await deps.db.from("email_out").select("id", { count: "exact", head: true }).eq("user_id", o.userId).eq("kind", "receipt").neq("dedup_key", o.dedupKey);
    if (count === 0) mail = withHelpLine(lang, mail, `${deps.appUrl}/help`);
  }
  await deps.db
    .from("email_out")
    .upsert(
      { user_id: o.userId, kind: o.kind, dedup_key: o.dedupKey, to_address: email, subject: mail.subject },
      { onConflict: "user_id,kind,dedup_key", ignoreDuplicates: true },
    );
  const { data: row } = await deps.db
    .from("email_out")
    .select("id,status")
    .eq("user_id", o.userId)
    .eq("kind", o.kind)
    .eq("dedup_key", o.dedupKey)
    .single();
  if (!row || row.status === "sent") return;
  try {
    const { id } = await deps.mailer.send({ to: email, ...mail });
    await deps.db.from("email_out").update({ status: "sent", provider_id: id, error: null }).eq("id", row.id);
  } catch (err) {
    await deps.db.from("email_out").update({ status: "failed", error: String(err).slice(0, 500) }).eq("id", row.id);
    throw err;
  }
}
