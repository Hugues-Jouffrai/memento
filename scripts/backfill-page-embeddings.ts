/**
 * `tsx scripts/backfill-page-embeddings.ts [--apply]`
 * Embeds every page that has no embedding for the current model (pages created before topic matching, D41), so they
 * can be matched. Dry run by default: lists the pages and the estimated cost. Service role from .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { MODELS } from "../src/ai/config";
import { createDefaultGateway } from "../src/ai/factory";
import { createMemorySink } from "../src/ai/sinks";
import { embeddingText } from "../src/domain/matching";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Variables may come from the environment.
}
const apply = process.argv.includes("--apply");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
console.log(`Database host: ${new URL(url).host}`);
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: pages, error } = await db.from("page").select("id,user_id,title,embedding_model").or(`embedding_model.is.null,embedding_model.neq.${MODELS.embedding}`);
if (error) throw new Error(error.message);
console.log(`${pages?.length ?? 0} page(s) without a ${MODELS.embedding} embedding`);

const sink = createMemorySink();
const ai = createDefaultGateway(sink);
for (const p of pages ?? []) {
  const { data: v } = await db.from("page_version").select("summary").eq("page_id", p.id).order("version", { ascending: false }).limit(1).single();
  const text = embeddingText(p.title as string, (v?.summary as string[]) ?? []);
  console.log(`- ${p.id} "${p.title}" (${text.length} chars)`);
  if (!apply) continue;
  const out = await ai.embed({ stage: "embed", userId: p.user_id as string, texts: [text] });
  const { error: e } = await db.from("page").update({ embedding: JSON.stringify(out.vectors[0]), embedding_model: out.model }).eq("id", p.id);
  if (e) throw new Error(e.message);
}
if (!apply) console.log("Dry run: nothing changed.");
else console.log(`Done. ${sink.calls.length} embedding call(s), $${sink.calls.reduce((n, c) => n + (c.costUsd ?? 0), 0).toFixed(6)}`);
