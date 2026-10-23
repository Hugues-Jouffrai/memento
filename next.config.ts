import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Prompts are read from disk at run time (src/ai/prompts.ts); make sure the serverless bundle contains them.
  outputFileTracingIncludes: {
    "/api/worker": ["./src/ai/prompts/**/*.md"],
  },
};

export default withNextIntl(nextConfig);
