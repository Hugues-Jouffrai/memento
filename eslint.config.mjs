import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextVitals from "eslint-config-next/core-web-vitals";

const GEMINI_SDK = "@google/genai";

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "eval/reports/**", "supabase/.temp/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextVitals,

  // Only the Gemini provider may import the Gemini SDK (CLAUDE.md: AI calls only through src/ai/gateway.ts).
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/ai/providers/gemini.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: GEMINI_SDK, message: "Only src/ai/providers/gemini.ts may import the AI SDK. Use the gateway." }] },
      ],
    },
  },

  // src/domain is pure: relative imports, zod and ts-fsrs only. No I/O, no framework.
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!\\.{1,2}/|@/domain/|zod$|ts-fsrs$)",
              message: "src/domain must stay pure: only relative imports, zod and ts-fsrs.",
            },
          ],
        },
      ],
    },
  },

  // No hard-coded UI strings: text in JSX must come from messages/*.json.
  {
    files: ["app/**/*.tsx", "src/ui/**/*.tsx"],
    rules: { "react/jsx-no-literals": ["error", { noStrings: false }] },
  },
);
