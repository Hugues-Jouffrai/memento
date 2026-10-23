import { describe, expect, it } from "vitest";
import { cardCap, cardShortfall, checkCard, validateCards, type CardCandidate, type RejectReason } from "@/domain/cards";
import { isGrounded } from "@/domain/excerpt";

const card = (i: number, over: Partial<CardCandidate> = {}): CardCandidate => ({
  claimIndex: i,
  question: `Quelle est la propriété numéro ${i} ?`,
  answer: `Réponse ${i}`,
  rank: i,
  ...over,
});

describe("[R-CARD-03] card quality validator", () => {
  it("accepts a self-contained open question", () => {
    expect(checkCard({ question: "Comment les abeilles indiquent-elles la direction d'une source de nectar ?", answer: "Par la danse frétillante." })).toBeNull();
  });
  it("rejects yes/no questions in FR and EN", () => {
    for (const q of ["Est-ce que le soleil est une étoile ?", "Is the sun a star?", "Peut-on boire l'eau de mer ?", "Does water boil at 100°C?"])
      expect(checkCard({ question: q, answer: "Oui" })).toBe("yes_no");
  });
  it("rejects questions that depend on the source context", () => {
    expect(checkCard({ question: "Que dit l'article sur la danse ?", answer: "x" })).toBe("context_reference");
    expect(checkCard({ question: "Quelle est la thèse, selon le texte ?", answer: "x" })).toBe("context_reference");
    expect(checkCard({ question: "What does the author say in the article?", answer: "x" })).toBe("context_reference");
    expect(checkCard({ question: "Qui a peint Marilyn ?", answer: "Comme dit ci-dessus, Warhol." })).toBe("context_reference");
  });
  it("rejects cards about the author or reader instead of the subject", () => {
    expect(checkCard({ question: "Quels sont les trois aspects sur lesquels l'auteur s'est informé ?", answer: "x" })).toBe("about_the_author");
    expect(checkCard({ question: "Quelles sources ont permis à l'auteur de se familiariser avec le sujet ?", answer: "x" })).toBe("about_the_author");
    expect(checkCard({ question: "What did the user learn about the pyramids?", answer: "x" })).toBe("about_the_author");
    expect(checkCard({ question: "Qui est l'auteur de Germinal ?", answer: "Émile Zola" })).toBeNull();
  });
  it("rejects empty, over-long and question-less cards", () => {
    expect(checkCard({ question: "Quoi ?", answer: " " })).toBe("empty");
    expect(checkCard({ question: "Quoi ?", answer: "a".repeat(281) })).toBe("too_long");
    expect(checkCard({ question: "Une affirmation", answer: "x" })).toBe("no_question_mark");
  });
});

describe("[R-CARD-04] cards per source", () => {
  it("never returns more than 8 cards, most important first", () => {
    const { accepted, rejected } = validateCards(Array.from({ length: 12 }, (_, i) => card(12 - i)));
    expect(accepted).toHaveLength(8);
    expect(accepted.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rejected.filter((r) => r.reason === "over_cap")).toHaveLength(4);
  });
  it("drops duplicate questions and invalid cards but keeps the rest", () => {
    const { accepted, rejected } = validateCards([card(1), card(2, { question: card(1).question }), card(3, { question: "Vrai ou faux" })]);
    expect(accepted).toHaveLength(1);
    expect(rejected.map((r) => r.reason).sort()).toEqual(["duplicate", "no_question_mark"]);
  });
});

describe("[R-KB-05] excerpt grounding", () => {
  const source = "L’énergie solaire a doublé en cinq ans — selon l’agence.";
  it("finds an excerpt despite quote style, case and whitespace differences", () => {
    expect(isGrounded("l'énergie  SOLAIRE a doublé", source)).toBe(true);
    expect(isGrounded("en cinq ans - selon l'agence", source)).toBe(true);
  });
  it("rejects an invented excerpt or an empty one", () => {
    expect(isGrounded("l'énergie éolienne a triplé", source)).toBe(false);
    expect(isGrounded("   ", source)).toBe(false);
  });
});

describe("[R-CARD-08] the cap follows the user's request", () => {
  it("is 8 without a request, the requested number with one, never above 30", () => {
    expect(cardCap(undefined)).toBe(8);
    expect(cardCap(null)).toBe(8);
    expect(cardCap(2)).toBe(2);
    expect(cardCap(12)).toBe(12);
    expect(cardCap(30)).toBe(30);
    expect(cardCap(99)).toBe(30);
  });
  it("keeps 12 of 15 valid cards with max 12, and 30 of 35 with max 30, most important first", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => card(n - i));
    const twelve = validateCards(many(15), 12);
    expect(twelve.accepted.map((c) => c.rank)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(twelve.rejected.filter((r) => r.reason === "over_cap")).toHaveLength(3);
    const thirty = validateCards(many(35), 30);
    expect(thirty.accepted).toHaveLength(30);
    expect(thirty.rejected.filter((r) => r.reason === "over_cap")).toHaveLength(5);
  });
  it("keeps only 2 when 2 are asked", () => {
    expect(validateCards([card(1), card(2), card(3)], 2).accepted).toHaveLength(2);
  });
});

describe("[R-CARD-09] a second card must test another angle", () => {
  it("drops a card whose question only differs by case, accents or punctuation", () => {
    const first = card(1, { question: "Pourquoi Teotihuacan est-elle abandonnée ?" });
    const again = card(1, { rank: 2, question: "pourquoi teotihuacan est-elle abandonnee ?!", answer: "Autre texte." });
    const { accepted, rejected } = validateCards([first, again]);
    expect(accepted).toHaveLength(1);
    expect(rejected.map((r) => r.reason)).toEqual(["duplicate"]);
  });
  it("drops a second card with the same answer for the same claim", () => {
    const a = card(1, { question: "Quel rôle joue la danse chez les abeilles ?", answer: "Elle indique la direction du nectar." });
    const b = card(1, { rank: 2, question: "À quoi sert la danse des abeilles ?", answer: "Elle indique la direction du nectar !" });
    const { accepted, rejected } = validateCards([a, b]);
    expect(accepted).toEqual([a]);
    expect(rejected[0]!.reason).toBe("duplicate");
  });
  it("keeps a second card on the same claim with a different question and answer", () => {
    const a = card(1, { question: "Que signale la danse frétillante des abeilles ?", answer: "La direction du nectar." });
    const b = card(1, { rank: 2, question: "Comment les abeilles indiquent-elles la distance du nectar ?", answer: "Par la durée de la danse." });
    expect(validateCards([a, b]).accepted).toHaveLength(2);
  });
  it("keeps the same answer when it belongs to two different claims", () => {
    const a = card(1, { answer: "En 63 av. J.-C." });
    const b = card(2, { rank: 2, answer: "En 63 av. J.-C." });
    expect(validateCards([a, b]).accepted).toHaveLength(2);
  });
});

describe("[R-CARD-10] shortfall counts", () => {
  const rej = (...reasons: RejectReason[]) => reasons.map((reason) => ({ reason }));
  it("is null without a request or when the request is met", () => {
    expect(cardShortfall(null, 3, [])).toBeNull();
    expect(cardShortfall(undefined, 3, [])).toBeNull();
    expect(cardShortfall(10, 10, [])).toBeNull();
    expect(cardShortfall(2, 2, rej("over_cap"))).toBeNull();
  });
  it("counts the dropped reasons and puts the unexplained part under not_enough_facts", () => {
    expect(cardShortfall(10, 6, rej("duplicate", "duplicate", "yes_no"))).toEqual({ requested: 10, kept: 6, dropped: { duplicate: 2, yes_no: 1, not_enough_facts: 1 } });
    expect(cardShortfall(10, 4, [])).toEqual({ requested: 10, kept: 4, dropped: { not_enough_facts: 6 } });
    expect(cardShortfall(5, 3, rej("too_long", "empty"))).toEqual({ requested: 5, kept: 3, dropped: { too_long: 1, empty: 1 } });
    expect(cardShortfall(5, 3, rej("empty"), 1)).toEqual({ requested: 5, kept: 3, dropped: { empty: 1, invalid_claim: 1 } });
  });
  it("holds counts only: no text", () => {
    expect(JSON.stringify(cardShortfall(10, 0, rej("context_reference")))).toBe('{"requested":10,"kept":0,"dropped":{"context_reference":1,"not_enough_facts":9}}');
  });
});
