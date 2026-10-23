import { getTranslations } from "next-intl/server";
import { SHARED_LOCAL_PART } from "@/domain/capture";
import { buildHelpArgs, HELP_LABEL_KEYS, type HelpFacts } from "@/domain/help";
import { REVIEW_TOKEN_TTL_SECONDS } from "./review-token";
import { receivingDomain } from "./config";

/** The address a user sends to: `add@` on the receiving domain, else the token address (R-CAP-12). */
export function sendingAddress(token: string | null): string {
  const receiving = receivingDomain();
  if (receiving) return `${SHARED_LOCAL_PART}@${receiving}`;
  return token ?? "";
}

/** Tutorial arguments for this request: labels from the screens' own keys, facts from the code and the profile. */
export async function helpArgs(facts: Omit<HelpFacts, "tokenHours">) {
  const labels = Object.fromEntries(
    await Promise.all(
      Object.entries(HELP_LABEL_KEYS).map(async ([arg, key]) => {
        const [ns, name] = key.split(".") as [string, string];
        return [arg, (await getTranslations(ns))(name)];
      }),
    ),
  ) as Record<keyof typeof HELP_LABEL_KEYS, string>;
  return buildHelpArgs(labels, { ...facts, tokenHours: REVIEW_TOKEN_TTL_SECONDS / 3600 });
}
