import { NextResponse } from "next/server";
import { prefFor } from "@/domain/reminder-pref";
import { verifyUnsubscribeToken } from "@/server/review-token";
import { createAdminClient } from "@/supabase/admin";

/** One-click unsubscribe (RFC 8058): mail apps POST here from the List-Unsubscribe header. */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = verifyUnsubscribeToken(token, process.env.REVIEW_LINK_SECRET);
  if (!userId) return new NextResponse(null, { status: 400 });
  const { error } = await createAdminClient().from("profile").update(prefFor("off", new Date())).eq("user_id", userId);
  return new NextResponse(null, { status: error ? 500 : 200 });
}

/** A person who opens the one-click address in a browser lands on the page with the choices. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/u/${encodeURIComponent(token)}`, req.url), 303);
}
