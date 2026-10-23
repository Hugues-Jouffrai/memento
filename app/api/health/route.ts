import { checkHealth } from "@/server/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkHealth({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  return Response.json(
    { ...result, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null },
    { status: result.ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
