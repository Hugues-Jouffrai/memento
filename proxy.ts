import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/join/", "/privacy", "/about", "/u/", "/api/unsubscribe/", "/auth/", "/api/health", "/api/inbound/", "/api/worker", "/r/", "/notify/"];

/** Refreshes the session cookie and sends signed-out visitors to /login, except the landing page at / and the public paths. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  // A review link sets a cookie; /review checks it itself and sends invalid ones to /login.
  const hasReviewLink = path.startsWith("/review") && request.cookies.has("review_token");
  const isLanding = path === "/";
  if (!data?.claims && !hasReviewLink && !isLanding && !PUBLIC.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|icon.svg|logo.svg|apple-icon.png|fonts/).*)"] };
