import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

/** Service-role client. Server-only; bypasses RLS. Never import from client code. */
export function createAdminClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
