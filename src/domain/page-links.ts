/** Pure rules for links between pages (R-KB-12, R-KB-13, D66): which of the model's proposals are applied. */
import type { PageCandidate } from "./matching";
import { MAX_LINK_REASON_CHARS } from "./kb";

/** A link is applied only at or above this confidence (same bar as a merge, D41; to be tuned from the eval). */
export const LINK_CONFIDENCE = 0.8;
export const MAX_LINKS_PER_SOURCE = 3;
/**
 * `shadow`: links are logged and nothing is written (the first 3 to 5 days, D66). `live`: they are applied with the
 * source. Flip to `live` once Hugues has reviewed the log with scripts/show-links.ts.
 */
export const LINK_MODE: "shadow" | "live" = "shadow";

export interface ProposedLink {
  candidate: number;
  reason: string;
  confidence: number;
}
export interface SelectedLink {
  page: PageCandidate;
  reason: string;
  confidence: number;
}

/**
 * Keeps the proposals that point at a listed candidate, are confident enough, have a usable reason and are not repeated;
 * at most MAX_LINKS_PER_SOURCE, most confident first. Everything refused comes back with its reason for the log.
 */
export function selectLinks(proposals: readonly ProposedLink[], candidates: readonly PageCandidate[], threshold = LINK_CONFIDENCE): { accepted: SelectedLink[]; rejected: { link: ProposedLink; why: string }[] } {
  const accepted: SelectedLink[] = [];
  const rejected: { link: ProposedLink; why: string }[] = [];
  const seen = new Set<number>();
  for (const link of [...proposals].sort((a, b) => b.confidence - a.confidence)) {
    const reason = link.reason.trim();
    const why =
      link.candidate < 1 || link.candidate > candidates.length
        ? "unknown candidate number"
        : seen.has(link.candidate)
          ? "repeated candidate"
          : link.confidence < threshold
            ? "below the confidence bar"
            : !reason || reason.length > MAX_LINK_REASON_CHARS
              ? "reason empty or too long"
              : accepted.length >= MAX_LINKS_PER_SOURCE
                ? "more than the allowed links per source"
                : null;
    if (why) {
      rejected.push({ link, why });
      continue;
    }
    seen.add(link.candidate);
    accepted.push({ page: candidates[link.candidate - 1]!, reason, confidence: link.confidence });
  }
  return { accepted, rejected };
}
