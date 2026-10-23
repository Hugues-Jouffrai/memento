// Writes supabase/templates/magic_link.html from the shared mail layout. Run after changing the layout or the texts,
// then `supabase config push` (Hugues) to send it to Auth. Usage: pnpm tsx scripts/build-auth-template.ts
import { writeFileSync } from "node:fs";
import { magicLinkTemplate } from "../src/server/auth-template";

writeFileSync("supabase/templates/magic_link.html", magicLinkTemplate() + "\n");
console.log("wrote supabase/templates/magic_link.html");
