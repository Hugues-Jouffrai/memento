/**
 * Structure of the About page (R-ABOUT-01, 02, 10; D65). The words live in messages `about.sections.<id>.<role>`;
 * this file fixes the order, the role of every block and the sources each section cites, so tests can check them.
 * Role: "theory" (what research found), "algorithm" (how FSRS works), "memento" (what the app does, or a product choice).
 */
export const ABOUT_ROLES = ["theory", "algorithm", "memento"] as const;
export type AboutRole = (typeof ABOUT_ROLES)[number];

export interface AboutSection {
  id: string;
  /** Colour of the number square and the top rule. */
  role: AboutRole;
  /** Blocks in reading order; the message key is the role name. */
  blocks: readonly AboutRole[];
  /** Source ids from src/config/about-sources.ts, in display order. */
  sources: readonly string[];
}

export const ABOUT_SECTIONS: readonly AboutSection[] = [
  { id: "forgetting", role: "theory", blocks: ["theory", "memento"], sources: ["fsrs"] },
  { id: "testing", role: "theory", blocks: ["theory", "memento"], sources: ["dunlosky", "roediger"] },
  { id: "spacing", role: "theory", blocks: ["theory", "memento"], sources: ["dunlosky"] },
  { id: "fsrs", role: "algorithm", blocks: ["algorithm", "memento"], sources: ["fsrs", "wiki", "tsfsrs"] },
  { id: "cards", role: "memento", blocks: ["memento"], sources: [] },
  { id: "budget", role: "memento", blocks: ["memento"], sources: [] },
];
