import { after } from "next/server";
import { handleInbound } from "@/server/inbound";
import { kickWorker } from "@/server/kick";
import { createAdminClient } from "@/supabase/admin";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await handleInbound(rawBody, request.headers, {
    db: createAdminClient(),
    webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    kick: () => after(kickWorker),
  });
  return Response.json(result.body, { status: result.status });
}
