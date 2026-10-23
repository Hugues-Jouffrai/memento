import { NextResponse } from "next/server";
import { buildExportZip } from "@/server/account";
import { createAdminClient } from "@/supabase/admin";
import { createSessionClient } from "@/supabase/server";

/** R-SEC-06: the signed-in user downloads their pages, sources, cards and reviews as one zip. Full sign-in only. */
export async function GET() {
  const { data } = await (await createSessionClient()).auth.getUser();
  if (!data.user?.email) return new NextResponse(null, { status: 401 });
  const zip = await buildExportZip(createAdminClient(), data.user.id, data.user.email);
  return new NextResponse(Buffer.from(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="memento-export-${new Date().toISOString().slice(0, 10)}.zip"`,
      "cache-control": "no-store",
    },
  });
}
