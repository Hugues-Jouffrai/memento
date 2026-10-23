import { describe, expect, it } from "vitest";
import { htmlToText, parseMail, stripFooters } from "@/domain/mail";

describe("[R-CAP-07] HTML and plain-text bodies", () => {
  it("turns HTML into readable text and drops scripts, styles and tracking pixels", () => {
    const html =
      '<html><head><style>p{color:red}</style></head><body><p>Bonjour &amp; bienvenue</p><img src="https://t.example/p.gif" width="1"><script>x()</script><div>Ligne 2</div></body></html>';
    expect(htmlToText(html)).toBe("Bonjour & bienvenue\nLigne 2");
  });
  it("keeps link targets next to their label", () => {
    expect(htmlToText('<a href="https://ex.org/a">à lire</a>')).toBe("à lire (https://ex.org/a)");
  });
  it("uses the HTML body when there is no text part", () => {
    expect(parseMail({ subject: "Idée", html: "<p>Les abeilles dansent</p>" }).sourceText).toContain("Les abeilles dansent");
  });
});

describe("[R-CAP-09] footers, signatures and forwarding wrappers are stripped", () => {
  it("removes unsubscribe lines and the signature", () => {
    const text = "Contenu utile\nSe désinscrire ici\nVoir dans le navigateur\n-- \nHugues\n06 00 00 00 00";
    expect(stripFooters(text)).toBe("Contenu utile");
  });
  it("a forwarded newsletter yields no footer or wrapper text in the source", () => {
    const m = parseMail({
      subject: "Fwd: La newsletter",
      text: [
        "Intéressant, retiens le point sur l'énergie",
        "",
        "---------- Forwarded message ---------",
        "From: Newsletter <n@example.org>",
        "Date: Mon, 1 Oct 2026",
        "Subject: La newsletter",
        "",
        "L'énergie solaire a doublé en cinq ans.",
        "Se désinscrire | Unsubscribe",
        "You are receiving this email because you subscribed.",
      ].join("\n"),
    });
    expect(m.sourceText).toBe("L'énergie solaire a doublé en cinq ans.");
    expect(m.sourceText).not.toMatch(/Forwarded|From:|Unsubscribe|Se désinscrire|receiving/i);
  });
});

describe("[R-CAP-08] user note", () => {
  it("a forwarded mail: the note is the subject plus the user's words, used as an instruction", () => {
    const m = parseMail({
      subject: "Fwd: Article sur les abeilles",
      text: "Concentre-toi sur la danse\n\n-------- Message transféré --------\nDe: x@y.z\n\nLes abeilles communiquent par la danse.",
    });
    expect(m.sourceKind).toBe("email_body");
    expect(m.instruction).toBe("Concentre-toi sur la danse");
    expect(m.note).toBe("Article sur les abeilles\nConcentre-toi sur la danse");
    expect(m.sourceText).toBe("Les abeilles communiquent par la danse.");
  });
  it("a personal note with no forwarded content is itself the source", () => {
    const m = parseMail({ subject: "Expo Warhol", text: "Vu la sérigraphie des Marilyn, très colorée.\nÀ retenir : 1962." });
    expect(m.sourceKind).toBe("user_note");
    expect(m.forwarded).toBeNull();
    expect(m.instruction).toBe("");
    expect(m.sourceText).toBe("Expo Warhol\nVu la sérigraphie des Marilyn, très colorée.\nÀ retenir : 1962.");
  });
  it("a link-only mail keeps the link in the note", () => {
    const m = parseMail({ subject: "", text: "https://example.org/article" });
    expect(m.sourceText).toBe("https://example.org/article");
  });
  it("a subject with Re:/Fwd:/TR: prefixes is cleaned and newlines cannot leak in", () => {
    expect(parseMail({ subject: "TR: Fwd: Sujet\r\nBcc: x@y.z", text: "corps" }).title).toBe("Sujet Bcc: x@y.z");
  });
});
