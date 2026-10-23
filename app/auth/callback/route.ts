import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/server/auth";
import { createSessionClient } from "@/supabase/server";

/** Magic-link landing: exchanges the PKCE code for a session. Failure sends the user to the code form's fallback. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext(searchParams.get("next")), origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", origin));
}
