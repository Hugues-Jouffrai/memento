import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function walk(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const rel = (f: string) => path.relative(ROOT, f).replaceAll("\\", "/");
const sources = ["app", "src", "eval", "tests"]
  .flatMap((d) => walk(path.join(ROOT, d)))
  .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("architecture.test.ts"));
const imports = (f: string) => readFileSync(f, "utf8");

describe("architecture rules", () => {
  it("[R-PIPE-07] only src/ai/providers/gemini.ts imports the Gemini SDK", () => {
    const offenders = sources.filter((f) => imports(f).includes("@google/genai")).map(rel);
    expect(offenders).toEqual(["src/ai/providers/gemini.ts"]);
  });

  it("[R-PIPE-07] provider modules are imported only by the gateway wiring, never by feature code", () => {
    const allowed = new Set(["src/ai/factory.ts", "src/ai/gateway.test.ts", "eval/run.ts", "eval/runner.test.ts", "eval/revise.test.ts", "eval/link.test.ts", "tests/integration/pipeline-support.ts", "tests/integration/reminders.test.ts", "src/ai/schemas.test.ts"]);
    const offenders = sources
      .filter((f) => /providers\/(gemini|fake)/.test(imports(f)) && !rel(f).startsWith("src/ai/providers/"))
      .map(rel)
      .filter((f) => !allowed.has(f));
    expect(offenders).toEqual([]);
  });

  it("[R-PIPE-07] no 'use server' file imports from src/ai", () => {
    const offenders = sources
      .filter((f) => /^\s*['"]use server['"]/m.test(imports(f)) && /from\s+['"](@\/ai|.*\/ai\/)/.test(imports(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("[R-PIPE-07] src/domain imports no I/O or framework modules", () => {
    const bad = /from\s+['"](node:|fs|path|next|react|@google|@supabase)/;
    const offenders = sources.filter((f) => rel(f).startsWith("src/domain/") && bad.test(imports(f))).map(rel);
    expect(offenders).toEqual([]);
  });
});
