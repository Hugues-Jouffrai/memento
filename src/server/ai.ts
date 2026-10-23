import { createDbSink } from "@/ai/db-sink";
import { createDefaultGateway } from "@/ai/factory";
import { createAdminClient } from "@/supabase/admin";

/** The app's gateway: Gemini, with every call logged to `ai_call`. */
export function createAppGateway() {
  return createDefaultGateway(createDbSink(createAdminClient().from("ai_call")));
}
