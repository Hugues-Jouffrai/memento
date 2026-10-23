import { describe, expect, it } from "vitest";
import { MAX_REQUESTED_CARDS, firstCardRequest, parseCardRequest } from "@/domain/card-request";

describe("[R-CAP-14] card count requested in the user's words", () => {
  it("reads digits next to cards in French and English", () => {
    expect(parseCardRequest("Teotihuacan : fais-moi 10 cartes")).toBe(10);
    expect(parseCardRequest("Teotihuacan: make me 10 cards")).toBe(10);
    expect(parseCardRequest("Génère 12 flashcards sur Cicéron")).toBe(12);
    expect(parseCardRequest("create 7 flash cards about Rome")).toBe(7);
    expect(parseCardRequest("donne-moi 15 questions sur les Aztèques")).toBe(15);
    expect(parseCardRequest("Give me 6 questions on photosynthesis")).toBe(6);
    expect(parseCardRequest("I need 9 good cards")).toBe(9);
    expect(parseCardRequest("Je voudrais 9 bonnes cartes")).toBe(9);
  });

  it("reads number words from one to thirty in both languages", () => {
    expect(parseCardRequest("fais dix cartes")).toBe(10);
    expect(parseCardRequest("make ten cards")).toBe(10);
    expect(parseCardRequest("crée douze cartes")).toBe(12);
    expect(parseCardRequest("generate twelve flashcards")).toBe(12);
    expect(parseCardRequest("donne-moi dix-sept cartes")).toBe(17);
    expect(parseCardRequest("make seventeen cards")).toBe(17);
    expect(parseCardRequest("fais vingt cartes")).toBe(20);
    expect(parseCardRequest("fais vingt et une cartes")).toBe(21);
    expect(parseCardRequest("fais vingt-deux cartes")).toBe(22);
    expect(parseCardRequest("make twenty-five cards")).toBe(25);
    expect(parseCardRequest("make twenty five cards")).toBe(25);
    expect(parseCardRequest("fais trente cartes")).toBe(30);
    expect(parseCardRequest("make thirty cards")).toBe(30);
    expect(parseCardRequest("deux cartes seulement")).toBe(2);
    expect(parseCardRequest("Just 2 cards please")).toBe(2);
  });

  it("ignores case, accents and punctuation", () => {
    expect(parseCardRequest("GENERE 8 CARTES")).toBe(8);
    expect(parseCardRequest("Génère 8 cartes mémoire.")).toBe(8);
    expect(parseCardRequest("cartes : 14")).toBe(14);
    expect(parseCardRequest("Number of cards: 11")).toBe(11);
  });

  it("clamps above 30 to 30 and ignores 0", () => {
    expect(parseCardRequest("make 31 cards")).toBe(MAX_REQUESTED_CARDS);
    expect(parseCardRequest("make 100 cards")).toBe(MAX_REQUESTED_CARDS);
    expect(parseCardRequest("make 0 cards")).toBeNull();
    expect(parseCardRequest("zéro carte")).toBeNull();
  });

  it("does not misfire on years, phone numbers, durations or other numbers", () => {
    expect(parseCardRequest("2022 cards")).toBeNull();
    expect(parseCardRequest("the 1998 questions were hard")).toBeNull();
    expect(parseCardRequest("Cards in 10 minutes")).toBeNull();
    expect(parseCardRequest("in 10 minutes make me nothing")).toBeNull();
    expect(parseCardRequest("make 10 minutes of cards")).toBeNull();
    expect(parseCardRequest("Appelle le 06 12 34 56 78 cartes")).toBeNull();
    expect(parseCardRequest("J'ai lu 10 pages sur Rome")).toBeNull();
    expect(parseCardRequest("Rome was founded in 753 BC, with 7 kings")).toBeNull();
    expect(parseCardRequest("version 2.5 cards")).toBeNull();
    expect(parseCardRequest("le 12/10 cartes postales")).toBeNull();
    expect(parseCardRequest("make cards")).toBeNull();
    expect(parseCardRequest("")).toBeNull();
    expect(parseCardRequest(null)).toBeNull();
    expect(parseCardRequest(undefined)).toBeNull();
  });

  it("does not treat fiches as cards (D55)", () => {
    expect(parseCardRequest("fais-moi 10 fiches")).toBeNull();
    expect(parseCardRequest("create 10 fiches on Rome")).toBeNull();
  });

  it("takes singular and questions only after a verb of asking in the same sentence", () => {
    expect(parseCardRequest("J'ai une question sur Rome")).toBeNull();
    expect(parseCardRequest("I have 2 questions about Rome")).toBeNull();
    expect(parseCardRequest("Une carte de la ville de Paris")).toBeNull();
    expect(parseCardRequest("Fais une carte sur Rome")).toBe(1);
    expect(parseCardRequest("make one card on Rome")).toBe(1);
    expect(parseCardRequest("J'ai une question. Génère 5 questions")).toBe(5);
  });

  it("accepts a verb followed by the number alone", () => {
    expect(parseCardRequest("Teotihuacan, crée-moi 10.")).toBe(10);
    expect(parseCardRequest("Make me 12")).toBe(12);
    expect(parseCardRequest("make 10 minutes")).toBeNull();
  });

  it("the first valid request wins", () => {
    expect(parseCardRequest("make 5 cards, no 20 cards")).toBe(5);
    expect(parseCardRequest("2022 cards, then 4 cards")).toBe(4);
  });

  it("ignores numbers inside links", () => {
    expect(parseCardRequest("https://example.com/10-cards résumé")).toBeNull();
  });

  it("reads the note first, then the instruction", () => {
    expect(firstCardRequest("Rome", "fais 8 cartes")).toBe(8);
    expect(firstCardRequest("Rome 4 cartes", "fais 8 cartes")).toBe(4);
    expect(firstCardRequest("Rome", null)).toBeNull();
  });
});
