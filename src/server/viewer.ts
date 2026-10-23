import { cookies } from "next/headers";
import { createSessionClient } from "@/supabase/server";
import { verifyReviewToken } from "./review-token";

export const REVIEW_COOKIE = "review_token";

export interface Viewer {
  userId: string;
  /** `link`: only the signed review link, good for the review session and nothing else (R-REV-05). */
  via: "session" | "link";
}

/** Full sign-in only. Used by every screen except the review session. */
export async function sessionViewer(): Promise<Viewer | null> {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { userId: data.user.id, via: "session" } : null;
}

/** Review session: a full sign-in, or a valid (not expired, untampered) review link cookie. */
export async function reviewViewer(): Promise<Viewer | null> {
  const full = await sessionViewer();
  if (full) return full;
  const token = (await cookies()).get(REVIEW_COOKIE)?.value;
  const userId = verifyReviewToken(token, process.env.REVIEW_LINK_SECRET);
  return userId ? { userId, via: "link" } : null;
}
