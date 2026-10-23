import type { SupabaseClient } from "@supabase/supabase-js";
import { zipSync, strToU8 } from "fflate";
import { buildExportFiles, type ExportCard, type ExportData, type ExportPage, type ExportReview, type ExportSource } from "@/domain/export";

const must = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`export ${what}: ${r.error.message}`);
  return r.data ?? ([] as unknown as T);
};

/** Reads everything one user owns (service role, filtered by user id) for the export (R-SEC-06). */
export async function loadExportData(db: SupabaseClient, userId: string, email: string, now: Date): Promise<ExportData> {
  const [pages, versions, claims, cites, sources, cards, states, reviews] = await Promise.all([
    db.from("page").select("id,title,created_at").eq("user_id", userId).order("created_at"),
    db.from("page_version").select("page_id,version,summary").eq("user_id", userId),
    db.from("claim").select("id,page_id,text,origin,status,created_at").eq("user_id", userId).order("created_at"),
    db.from("citation").select("claim_id,source_id,excerpt").eq("user_id", userId),
    db.from("source").select("id,kind,title,url,language,created_at,extracted_text").eq("user_id", userId).order("created_at"),
    db.from("card").select("id,status,question,answer,claim_id,source_id,created_at").eq("user_id", userId).order("created_at"),
    db.from("fsrs_state").select("card_id,due,reps,lapses").eq("user_id", userId),
    db.from("review_log").select("card_id,rating,reviewed_at,duration_ms").eq("user_id", userId).order("reviewed_at"),
  ]);
  const latest = new Map<string, string[]>();
  const best = new Map<string, number>();
  for (const v of must(versions, "versions") as { page_id: string; version: number; summary: string[] }[]) {
    if (v.version > (best.get(v.page_id) ?? 0)) {
      best.set(v.page_id, v.version);
      latest.set(v.page_id, v.summary);
    }
  }
  const citesBy = new Map<string, { source_id: string; excerpt: string }[]>();
  for (const c of must(cites, "citations") as { claim_id: string; source_id: string; excerpt: string }[]) {
    citesBy.set(c.claim_id, [...(citesBy.get(c.claim_id) ?? []), { source_id: c.source_id, excerpt: c.excerpt }]);
  }
  const claimRows = must(claims, "claims") as { id: string; page_id: string; text: string; origin: "source" | "model"; status: string }[];
  const pageRows = must(pages, "pages") as { id: string; title: string; created_at: string }[];
  const exportPages: ExportPage[] = pageRows.map((p) => ({
    ...p,
    summary: latest.get(p.id) ?? [],
    claims: claimRows.filter((c) => c.page_id === p.id).map((c) => ({ id: c.id, text: c.text, origin: c.origin, status: c.status, sources: citesBy.get(c.id) ?? [] })),
  }));
  const pageOfClaim = new Map(claimRows.map((c) => [c.id, pageRows.find((p) => p.id === c.page_id)?.title ?? null]));
  const stateBy = new Map((must(states, "fsrs") as { card_id: string; due: string; reps: number; lapses: number }[]).map((s) => [s.card_id, s]));
  const exportCards: ExportCard[] = (must(cards, "cards") as { id: string; status: string; question: string; answer: string; claim_id: string; source_id: string; created_at: string }[]).map((c) => ({
    id: c.id,
    status: c.status,
    question: c.question,
    answer: c.answer,
    page_title: pageOfClaim.get(c.claim_id) ?? null,
    source_id: c.source_id,
    created_at: c.created_at,
    due: stateBy.get(c.id)?.due ?? null,
    reps: stateBy.get(c.id)?.reps ?? null,
    lapses: stateBy.get(c.id)?.lapses ?? null,
  }));
  return {
    email,
    exportedAt: now.toISOString(),
    pages: exportPages,
    sources: must(sources, "sources") as ExportSource[],
    cards: exportCards,
    reviews: must(reviews, "reviews") as ExportReview[],
  };
}

/** The export as one zip file. */
export async function buildExportZip(db: SupabaseClient, userId: string, email: string, now = new Date()): Promise<Uint8Array> {
  const files = buildExportFiles(await loadExportData(db, userId, email, now));
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));
}

/** Every file under `<user>/` in the private originals bucket, however deep. */
async function listOriginals(db: SupabaseClient, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await db.storage.from("originals").list(prefix, { limit: 1000 });
  if (error) throw new Error(`list originals: ${error.message}`);
  for (const entry of data ?? []) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id === null) out.push(...(await listOriginals(db, path)));
    else out.push(path);
  }
  return out;
}

/**
 * R-SEC-06: deletes the account and everything it owns, now. Files first (they are found through the user id), then the
 * invite record that holds the address, then the account itself, which removes every row of the user by cascade.
 * Cost log rows (tokens and cost, no content) stay, detached from the user.
 */
export async function deleteAccount(db: SupabaseClient, userId: string, email: string): Promise<void> {
  const files = await listOriginals(db, userId);
  if (files.length) {
    const { error } = await db.storage.from("originals").remove(files);
    if (error) throw new Error(`delete originals: ${error.message}`);
  }
  await db.from("invite_use").delete().eq("email", email.trim().toLowerCase());
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new Error(`delete account: ${error.message}`);
}
