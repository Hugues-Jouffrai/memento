/**
 * Sources of the About page (R-ABOUT-02, D65). Data, not translated: the page shows only `verified` entries.
 * The two papers were checked against Crossref on 2026-10-20 (bibliographic data only, not read in full); the three
 * open-spaced-repetition pages are the ones recorded in the research notes. Add an entry as `to-verify` until its URL
 * has been opened; the page never renders one.
 */
export type SourceStatus = "verified" | "to-verify";

export interface AboutSource {
  id: string;
  authors: string;
  /** null for software and wiki pages that carry no year. */
  year: number | null;
  title: string;
  /** Journal, volume and pages; null when there is none. */
  venue: string | null;
  url: string;
  status: SourceStatus;
  /** Short name for the "Source:" links under a section. */
  short: string;
}

export const ABOUT_SOURCES: readonly AboutSource[] = [
  {
    id: "dunlosky",
    authors: "Dunlosky, Rawson, Marsh, Nathan, Willingham",
    year: 2013,
    title: "Improving Students' Learning With Effective Learning Techniques: Promising Directions From Cognitive and Educational Psychology",
    venue: "Psychological Science in the Public Interest, 14(1), 4–58",
    url: "https://doi.org/10.1177/1529100612453266",
    status: "verified",
    short: "Dunlosky et al.",
  },
  {
    id: "roediger",
    authors: "Roediger, Karpicke",
    year: 2006,
    title: "Test-Enhanced Learning: Taking Memory Tests Improves Long-Term Retention",
    venue: "Psychological Science, 17(3), 249–255",
    url: "https://doi.org/10.1111/j.1467-9280.2006.01693.x",
    status: "verified",
    short: "Roediger, Karpicke",
  },
  {
    id: "fsrs",
    authors: "open-spaced-repetition",
    year: null,
    title: "Free Spaced Repetition Scheduler",
    venue: null,
    url: "https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler",
    status: "verified",
    short: "FSRS",
  },
  {
    id: "wiki",
    authors: "open-spaced-repetition",
    year: null,
    title: "The Algorithm (awesome-fsrs wiki)",
    venue: null,
    url: "https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm",
    status: "verified",
    short: "The Algorithm",
  },
  {
    id: "tsfsrs",
    authors: "open-spaced-repetition",
    year: null,
    title: "ts-fsrs",
    venue: null,
    url: "https://github.com/open-spaced-repetition/ts-fsrs",
    status: "verified",
    short: "ts-fsrs",
  },
];

/** The entries the page may show. */
export const VERIFIED_SOURCES = ABOUT_SOURCES.filter((s) => s.status === "verified");
