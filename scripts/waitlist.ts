// Reads and edits the notify-me list (D54, R-LAND-08). Personal data: never commit an export.
// Usage (service role from env; Hugues runs it with --env-file=.env.local against production):
//   pnpm tsx --env-file=.env.local scripts/waitlist.ts count
//   pnpm tsx --env-file=.env.local scripts/waitlist.ts list
//   pnpm tsx --env-file=.env.local scripts/waitlist.ts export > waitlist.csv
//   pnpm tsx --env-file=.env.local scripts/waitlist.ts remove <email>
//   pnpm tsx --env-file=.env.local scripts/waitlist.ts purge
import { WAITLIST_RETENTION_MONTHS, waitlistCsv, type WaitlistRow } from "../src/domain/waitlist";
import { parseEmail } from "../src/server/auth";
import { createAdminClient } from "../src/supabase/admin";

const [cmd, ...rest] = process.argv.slice(2);
const usage = "Usage: waitlist.ts count | list | export | remove <email> | purge";
const db = createAdminClient();

async function allRows(): Promise<WaitlistRow[]> {
  const rows: WaitlistRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("waitlist").select("email,locale,confirmed_at").order("confirmed_at", { ascending: false }).range(from, from + 999);
    if (error) {
      console.error(`Failed: ${error.message}`);
      process.exit(1);
    }
    rows.push(...(data as WaitlistRow[]));
    if (data.length < 1000) return rows;
  }
}

if (cmd === "count") {
  const rows = await allRows();
  console.log(`${rows.length} confirmed`);
  for (const locale of ["fr", "en"]) console.log(`${locale}: ${rows.filter((r) => r.locale === locale).length}`);
} else if (cmd === "list") {
  for (const r of await allRows()) console.log(`${r.confirmed_at.slice(0, 10)}  ${r.locale}  ${r.email}`);
} else if (cmd === "export") {
  process.stdout.write(waitlistCsv(await allRows()));
} else if (cmd === "remove") {
  const email = parseEmail(rest[0]);
  if (!email) {
    console.error("Invalid email address");
    process.exit(1);
  }
  const { data, error } = await db.from("waitlist").delete().eq("email", email).select("id");
  if (error) {
    console.error(`Failed: ${error.message}`);
    process.exit(1);
  }
  console.log(data.length ? `Removed ${email}` : "Not on the list");
} else if (cmd === "purge") {
  const { data, error } = await db.rpc("purge_waitlist");
  if (error) {
    console.error(`Failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`Purged ${data as number} rows older than ${WAITLIST_RETENTION_MONTHS} months`);
} else {
  console.error(usage);
  process.exit(1);
}
