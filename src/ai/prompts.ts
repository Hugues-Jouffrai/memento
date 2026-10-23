import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const PROMPTS_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "src", "ai", "prompts");

export interface LoadedPrompt {
  stage: string;
  /** e.g. "v2". Recorded on every AI output (R-AI-02). */
  version: string;
  template: string;
}

/** Prompts are files: `src/ai/prompts/<stage>/vN.md`. Latest version unless one is pinned. */
export function loadPrompt(stage: string, version?: string, dir = PROMPTS_DIR): LoadedPrompt {
  const stageDir = path.join(/* turbopackIgnore: true */ dir, stage);
  const versions = readdirSync(/* turbopackIgnore: true */ stageDir)
    .map((f) => /^v(\d+)\.md$/.exec(f)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
  const chosen = version ?? (versions.length ? `v${versions[versions.length - 1]}` : undefined);
  if (!chosen) throw new Error(`No prompt found for stage "${stage}"`);
  return { stage, version: chosen, template: readFileSync(path.join(/* turbopackIgnore: true */ stageDir, `${chosen}.md`), "utf8") };
}

/**
 * Replaces `{{name}}`. A missing variable is an error, never an empty string.
 * Sections: `{{#name}}...{{/name}}` is kept when the variable is not empty, `{{^name}}...{{/name}}` when it is empty
 * (D64: one template serves both the default instructions and a user's explicit card count).
 */
export function renderPrompt(template: string, vars: Record<string, string>): string {
  const value = (name: string) => {
    const v = vars[name];
    if (v === undefined) throw new Error(`Missing prompt variable "${name}"`);
    return v;
  };
  return template
    .replace(/\{\{([#^])(\w+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (_, kind: string, name: string, body: string) => ((value(name) !== "") === (kind === "#") ? body : ""))
    .replace(/\{\{(\w+)\}\}/g, (_, name: string) => value(name));
}
