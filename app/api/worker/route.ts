import { createAppGateway } from "@/server/ai";
import { appUrl } from "@/server/config";
import { createPageFetcher } from "@/server/fetcher";
import { createOriginalsStore } from "@/server/storage";
import { createResendMailer, createResendMailSource } from "@/server/resend";
import { hasValidBearer } from "@/server/secrets";
import { runWorker } from "@/server/worker";
import { createAdminClient } from "@/supabase/admin";

export const maxDuration = 300;

/** Drains the job queue. Called right after an inbound capture and every minute by pg_cron (D17). */
export async function POST(request: Request) {
  if (!hasValidBearer(request.headers.get("authorization"), process.env.WORKER_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const apiKey = process.env.RESEND_API_KEY;
  const db = createAdminClient();
  const stats = await runWorker({
    db,
    ai: createAppGateway(),
    source: createResendMailSource(apiKey),
    mailer: createResendMailer(apiKey),
    pages: createPageFetcher(),
    files: createOriginalsStore(db),
    appUrl: appUrl(),
    reviewLinkSecret: process.env.REVIEW_LINK_SECRET,
    now: () => new Date(),
  });
  return Response.json(stats);
}
