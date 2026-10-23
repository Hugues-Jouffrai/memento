import { NextResponse, type NextRequest } from "next/server";
import { verifyReviewToken, REVIEW_TOKEN_TTL_SECONDS } from "@/server/review-token";
import { REVIEW_COOKIE } from "@/server/viewer";

/** R-REV-05: the reminder's deep link. A valid token opens the review session; anything else goes to login. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { origin } = request.nextUrl;
  if (!verifyReviewToken(token, process.env.REVIEW_LINK_SECRET)) {
    return NextResponse.redirect(new URL("/login", origin));
  }
  const res = NextResponse.redirect(new URL("/review", origin));
  res.cookies.set(REVIEW_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REVIEW_TOKEN_TTL_SECONDS,
  });
  res.headers.set("referrer-policy", "no-referrer");
  return res;
}
