// Creates a confirmed user while public sign-ups are closed (D28).
// Usage: pnpm tsx --env-file=.env.local scripts/create-user.ts someone@example.com
import { createAdminClient } from "../src/supabase/admin";

const email = process.argv[2]?.trim().toLowerCase();
if (!email?.includes("@")) {
  console.error("Usage: create-user.ts <email>");
  process.exit(1);
}
const { data, error } = await createAdminClient().auth.admin.createUser({ email, email_confirm: true });
if (error) {
  console.error(`Failed: ${error.message}`);
  process.exit(1);
}
console.log(`Created user ${data.user.id} (${email})`);
