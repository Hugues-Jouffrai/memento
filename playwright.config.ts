import { defineConfig } from "@playwright/test";
import { localSupabaseEnv } from "./tests/e2e/local-env";

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    command: "pnpm build && pnpm exec next start --port 3100",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: { ...localSupabaseEnv(), GEMINI_API_KEY: "unused-in-e2e", REVIEW_LINK_SECRET: "e2e-review-link-secret-value", RESEND_RECEIVING_DOMAIN: "capture.test", MAIL_TRANSPORT: "mailpit" },
  },
});
