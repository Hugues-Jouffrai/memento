# À propos / About page: design (approved 2026-10-20, D65; where this file and D65 or the R-ABOUT rows differ, they win: roles are colour-coded and labelled, sources verified, no figures, Ebbinghaus and Bjork dropped)

Scope: a public explainer page of the learning theory behind the app, with sources the reader can follow. Nothing is built. No code, messages, spec rows or decisions were changed; the new requirement IDs below are proposals for `docs/02-spec.md` and a new decision (D60 or later) once Hugues approves. Vocabulary follows D55 (carte, fiche, À valider, cartes à réviser). The product name stays the `{brand}` argument (D49, `src/config/brand.ts`).

## 1. Purpose

Answer one question for a curious non-expert: "why does this app work the way it does, and what is that based on?" Concretely it explains five design choices and ties each to published work or to a plain statement that it is a product choice:

1. cards come back at growing intervals (spacing),
2. you answer from memory before seeing the answer (testing),
3. forgetting is expected and the schedule plans for it (forgetting curve),
4. a scheduler (FSRS) picks the next date from your own answers,
5. the AI proposes cards but you decide which ones enter your reviews.

It is also the honest place for limits: what the research does not show, and what is a product choice rather than science. It is not marketing. D5 stands: FSRS benefit claims are not marketed, so the page never says "FSRS saves X% of reviews" or "FSRS beats the older algorithm". The only FSRS statements are what it models and how it picks a date.

## 2. Audience and languages

- Non-experts: a friend in the beta, a visitor from the landing page. No jargon without a one-line gloss; no formulas on the page body (the one optional formula sits in a closed `<details>`).
- French first (D4, D22: the UI language is the user's own choice, default French; the browser's `Accept-Language` is ignored), English available through the same cookie. All copy lives in `messages/{fr,en}.json` under a new `about` key (CLAUDE.md: no hard-coded strings). Source titles, authors and URLs are data in a constant (see section 7), not translated; the label around them is.
- Tone rules: plain words, "tu" as in the landing and help copy, no hype words (no "scientifiquement prouvé", no "révolutionnaire"), no number without a source line next to it. Hedging wording is exact: "plusieurs études ont trouvé", never "il est prouvé".

## 3. Where it lives

| Question | Proposal | Why |
|---|---|---|
| Route | `/about` (page title "À propos" / "About") | Short, matches the nav vocabulary; the French URL stays English like `/settings`, `/help`, `/tray`. |
| Signed in or out | **Public** (add `/about` to `PUBLIC` in `proxy.ts`, like `/privacy`) | A visitor on the landing page should be able to read why before asking to be notified; sources are not private. No user data on the page. |
| Nav bar | **Not added.** | The phone bottom bar holds five links at 44 px (D47 rejected a sixth, R-UI-02). |
| Links to it | (a) Paramètres, group "Aide" (`g-help`), next to "Comment ça marche" and "Revoir la visite guidée"; (b) landing footer next to the privacy link (`app/landing.tsx`); (c) one line at the end of `/help`; (d) the last walkthrough screen is optional, left to Hugues. | Same places the help page is reached from, plus the public entry point. |
| Distinct from `/help` | `/help` = how to use the app (steps, buttons). `/about` = why it is built this way (theory, sources). Each page links to the other once. | Avoids duplicating R-ONB-01 content. |

## 4. Page outline with draft French copy

One `h1` ("Pourquoi ça marche"), a one-sentence lede, then six `h2` sections in an ordered reading flow, then "Sources" and "Limites". Each section has 2 to 3 sentences, then its source list (section 5). The copy below is a draft for Hugues to rewrite; every claim is traceable to the sources of that section or marked as a product choice. No numbers appear in the draft (optional sourced figures are listed under "Optional figures").

**Lede.** « {brand} repose sur quelques résultats de recherche sur la mémoire, et sur quelques choix de produit. Cette page dit lesquels, d'où ils viennent, et où s'arrêtent les preuves. »

**1. Oublier est normal** (forgetting curve)
« On oublie vite ce qu'on vient d'apprendre, puis de plus en plus lentement. Les chercheurs appellent cela la courbe de l'oubli. Chaque fois qu'on se rappelle une information avec succès, elle s'efface plus lentement : c'est ce qui permet d'espacer les révisions. »
Basis: Ebbinghaus (to verify); the FSRS description that each successful review slows forgetting (algorithm wiki, FSRS README).

**2. Se tester vaut mieux que relire** (active recall, testing effect)
« Chercher la réponse dans sa mémoire aide davantage à retenir que relire le cours ou surligner. Dans une synthèse de la littérature sur dix techniques d'étude, l'autotest figure parmi les deux techniques jugées les plus utiles. C'est pourquoi {brand} te montre d'abord la question et te laisse répondre de tête avant de révéler la réponse. »
Basis: Dunlosky et al. (PSPI review, via the Scientific American Mind summary); Roediger and Karpicke (to verify).

**3. Espacer les révisions** (spacing)
« Réviser en plusieurs fois, avec des pauses, retient mieux que tout revoir d'un coup. Les auteurs de la même synthèse placent aussi l'espacement parmi les deux techniques les plus utiles. L'écart idéal dépend du temps pendant lequel on veut se souvenir : plus la date visée est lointaine, plus les révisions peuvent être espacées. »
Basis: Dunlosky et al. (the 10-20 % gap and the "one week / five years" examples are in the summary; see "Optional figures").

**4. Comment {brand} choisit la prochaine date** (FSRS)
« {brand} utilise un algorithme libre et public, FSRS. Pour chaque carte, il suit trois choses : sa difficulté, la solidité du souvenir et la probabilité de se souvenir aujourd'hui. Quand tu notes une réponse (À revoir, Difficile, Bien, Facile), il recalcule la prochaine date, de façon que la chance de se souvenir reste proche du niveau que tu as choisi dans les paramètres. »
Basis: FSRS README, algorithm wiki (three variables, four grades, interval chosen so predicted recall equals desired retention, default 90 %). Wording note: say "niveau choisi" and give 90 % only as the library default with its source; the app's default is `profile.desired_retention` 0.90 (migration `m1_accounts_capture_jobs`), so the number is also checkable in the code.
Not said, on purpose (D5): that FSRS needs fewer reviews or is more accurate than another scheduler. The research file records that the benchmark is run by the FSRS community and has no SM-2 row, and that RemNote's "20-30 % fewer reviews" is an unsourced vendor claim.

**5. Pourquoi les cartes passent par toi** (human in the loop)
« L'IA lit ce que tu envoies et propose des cartes ; elle n'en ajoute aucune à tes révisions sans ton accord. C'est un choix de produit, pas un résultat de recherche : choisir ce qui vaut la peine d'être retenu fait partie de l'apprentissage, et une carte mal formulée ou fausse serait révisée pour rien. Les faits tirés de ta source citent leur extrait ; ce que l'IA ajoute de ses propres connaissances est signalé comme non vérifié. »
Basis: D6, D31 (product decisions, cite them as such, not as science). Research for generating or choosing one's own material (generation effect, desirable difficulties) is only named in `docs/00-v1-analysis.md`, with no source recorded: mark "to verify" and keep the sentence as a product statement unless Hugues supplies a source. Dunlosky's own caveat that the techniques help only motivated, capable learners is a recorded, usable limit.

**6. Peu de minutes, chaque jour** (budget, optional section)
« {brand} limite le temps de révision que tu fixes par jour : quand la journée est pleine, les nouvelles cartes attendent. C'est un choix de produit, pour que le rythme reste tenable. »
Basis: D9, D14, D45 (product). Optional; cut if the page feels long. No claim about habit formation (no source recorded).

**Limites** (always shown, not collapsible)
« Ces résultats viennent d'études en laboratoire et en classe, surtout sur des listes de mots et des cours ; ils ne garantissent rien pour une personne en particulier. FSRS est un modèle de la mémoire, pas une mesure de la tienne. Les cartes écrites par une IA peuvent se tromper : relis-les avant de les garder. »
Basis: Dunlosky caveats, FSRS research file ("accuracy claims unverified by independent parties"), D31.

**Optional figures (decide with Hugues; default is to leave them out).** The research file gives sourced numbers: after one week students recalled 35 % of tested word pairs versus 4 % of untested ones; 80 % versus 36 % for Swahili-English pairs; across 254 studies (over 14,000 participants) recall was 47 % after spaced versus 37 % after massed study. The file says these are single illustrative experiments quoted by a secondary article, "do not generalise them". If used they need the line "chiffres cités par la synthèse de Dunlosky et al., études isolées" and the primary review verified first (open question 3).

## 5. Exact source list per section

Rule: title, authors, year, URL or DOI exactly as recorded in `the owner's private research notes/problems/cognitive-science-education/research/`. Where the research files record no URL or DOI, the entry is marked **to verify** and must not ship until Hugues or a later session confirms it. Nothing was fetched or searched for this document.

| § | Source (as recorded) | Authors, year | URL or DOI as recorded | Status |
|---|---|---|---|---|
| 1 | Hermann Ebbinghaus, forgetting curve (named in `docs/00-v1-analysis.md` §2 as "Ebbinghaus, 1885") | Ebbinghaus, 1885 | none recorded | **to verify** (title, edition, URL) |
| 1, 4 | FSRS README: free-spaced-repetition-scheduler (memory model: difficulty, stability, retrievability) | open-spaced-repetition, snapshot 2026-10-14 | https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler | recorded |
| 1, 4 | "The Algorithm", awesome-fsrs wiki (forgetting curve, R = 90 % when t = S, interval from desired retention) | open-spaced-repetition, snapshot 2026-10-14 | https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm | recorded |
| 2, 3 | "Improving Students' Learning With Effective Learning Techniques" (the review behind the article below; named, not ingested) | Dunlosky, Rawson, Marsh, Nathan, Willingham; 2013; Psychological Science in the Public Interest (volume and pages not recorded) | none recorded | **to verify** (DOI and URL) |
| 2, 3 | "What works, what doesn't", Scientific American Mind (secondary summary of the review; id `article-dunlosky-learning-techniques-2013`) | Dunlosky, Rawson, Marsh, Nathan, Willingham; Sept/Oct 2013 | none recorded (local copy `research/input/article-dunlosky-learning-techniques-2013/`) | **to verify** (public URL) |
| 2 | Testing effect / retrieval practice (named in `docs/00-v1-analysis.md` §2 as "Roediger & Karpicke, 2006") | Roediger and Karpicke, 2006 | none recorded; title not recorded | **to verify** (title, journal, DOI) |
| 3 | Spacing effect: same Dunlosky review and summary as above | | | see rows above |
| 4 | Anki manual, deck options (FSRS section: desired retention default 90 %, what workload does above 90 %) | Anki project, snapshot 2026-10-14 | https://docs.ankiweb.net/deck-options.html | recorded |
| 4 | ts-fsrs README (the library the app uses; ts-fsrs is pinned to 5.4.2, D30) | open-spaced-repetition | https://github.com/open-spaced-repetition/ts-fsrs | recorded |
| 4 (optional, background) | "A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling", KDD 2022 (the DHP model FSRS descends from; Chinese full text read, ACM version not read) | Ye, Su, Cao, 2022 | https://memodocs.maimemo.com/docs/2022_KDD ; ACM DOI 10.1145/3534678.3539081 (returned HTTP 403 when tried, so unread) | recorded; the ACM version is **to verify** |
| 4 (limits) | srs-benchmark README (community benchmark, run by the FSRS community, no SM-2 row) | open-spaced-repetition, snapshot 2026-10-14 | https://github.com/open-spaced-repetition/srs-benchmark | recorded |
| 5 | Product decisions D6, D31, D20 in `docs/decisions.md` (not external sources; the page says "choix de produit") | | | internal |
| 5 | Generation effect and desirable difficulties (named in `docs/00-v1-analysis.md` §2 as "Bjork") | Bjork, no year or title recorded | none recorded | **to verify**, or drop |
| Limits | Same Dunlosky rows; FSRS research page caveats | | | see rows above |

Not usable as sources: V1's About view ("Architecture of Memory") is marketing copy with no theory (`docs/00-v1-analysis.md` §2), so none of its text is reused. The RemNote "20-30 % fewer reviews" claim is a vendor claim and is not cited. Sweller's cognitive load papers are in the research folder but do not back any of the five choices above; they are not used (they could back a later "pourquoi des cartes courtes" section, minimum information principle, whose source is also only named, not recorded: "Wozniak, 20 rules", to verify).

Rendering rule for the list: each entry is one list item, "Auteurs (année). Titre. Éditeur" then the link as a separate line, exactly the recorded URL (no shortening, no tracking parameters). Links open in the same tab (no `target=_blank`, avoids an extra permission pattern and tab clutter); the "to verify" entries never render: the shipped page shows only verified entries, and a unit test fails if one with status `to verify` is referenced (section 8).

## 6. Layout notes

- Markup: reuse the existing server-rendered classes used by `/privacy` and `/help`: `main.login`-style single column, `.kicker`, `.sheet`, `.page-head`, `.lede`, `h2` per section, an ordered list for the six reasons. No new component, no client JavaScript, no new colours: tokens only (`--ink`, `--ink-2`, `--red`, `--blue`, `--paper`, `--rule`, `--tap` 2.75rem, `--measure` 42rem from `app/globals.css`).
- Four styles, same markup (D48): signal (default: Archivo and IBM Plex Mono, flat blocks, one `h1` big grotesk, sections separated by a heavy rule and a mono section number), revue (Newsreader text with a footnote style: the source list becomes real footnotes with superscript numbers; this is the natural home of the sourced layout), cahier (numbered sections like the questions, source list in italics), bristol (each section as an index card with a red header line). Only the `.group`/`.sheet` classes and counters differ; no style needs a new rule beyond the section-number counter, so the R-UI-02 stylesheet test is unaffected except for any new class (add it to the list).
- Rejected looks (D46, ui-redesign-brainstorm): no side-stripe callouts, no rounded cards, no icons or emoji per section, no pill badges, no gradients, no illustration of a "brain" or a curve. A forgetting-curve picture is **not** proposed for the first version: a hand-drawn chart would be an unsourced figure; if Hugues wants one, draw it from the FSRS formula in the wiki (R(t,S) with R = 90 % at t = S) and label it "illustration du modèle FSRS, pas une mesure".
- Reading width: `--measure` (42 rem), paragraphs of at most 3 sentences, one idea each, section titles as plain statements ("Se tester vaut mieux que relire").
- Limits section: a plain `h2` and paragraph, not a warning box.
- R-UI-03 (44 px targets): every standalone link (each source link, the back links to `/help` and `/settings`) is at least 44 px tall (`min-height: var(--tap)` through the same rule as `.empty > a`); inline links inside a sentence are excepted (WCAG 2.5.8, as in R-LAND-11). The optional formula `<details>` summary is 44 px tall, closed by default, native keyboard operation, no JavaScript. No horizontal scroll at 375 px: long URLs wrap with `overflow-wrap: anywhere` on the source link.
- Focus visible, 4.5:1 contrast, light and dark follow the system: inherited from the tokens.

## 7. Implementation notes (for later, not now)

- Data: `src/config/about-sources.ts` exports the source list (id, authors, year, title, url, status `verified | to-verify`). Copy keys reference source ids; the page renders only entries with status `verified`. This keeps URLs and years out of the message files and makes the tests mechanical.
- Messages: `about.*` in `messages/fr.json` and `messages/en.json`, with `{brand}` as an argument. No UI label is copied: grade names come from `review.again` etc. through ICU arguments, as R-ONB says for the help page.
- Route: `app/about/page.tsx`, server component, no data access, no `sessionViewer()` call (page is the same for everyone; the root layout already hides the nav bar when signed out).
- Effort: S (about half a day plus the source verification, which is Hugues's or a later research session).

## 8. Tests (proposed requirement rows; IDs are new, no `R-ABOUT` exists in the spec)

| ID | Phase | Requirement | Acceptance test |
|---|---|---|---|
| R-ABOUT-01 | B | `/about` is public, server-rendered, in French by default and English by the language cookie, with one `h1` and the section headings in the order of section 4. | e2e: signed out, `/about` answers 200, shows the French headings; with the English cookie shows the English ones; no redirect to `/login`. |
| R-ABOUT-02 | B | Every source shown comes from `about-sources.ts` with status `verified`, shows authors, year and title, and its URL is exactly the recorded one. | Unit: every source id referenced by the messages exists; none with status `to-verify` is rendered; each URL parses as https; ids unique. e2e: the source links on the page equal the constant's list. |
| R-ABOUT-03 | B | No numeric claim without a source: any digit sequence in the `about` messages must be an allow-listed, sourced figure (default allow-list: the default retention 90 %, taken from the code constant). | Unit: scan `about.*` in both languages; digits outside the allow-list fail the test. |
| R-ABOUT-04 | B | D5 is respected: the page never states that FSRS needs fewer reviews or is more accurate than another scheduler. | Unit: a deny-list of phrases (fr and en: "moins de révisions", "plus précis", "fewer reviews", "more accurate", "plus efficace", "prouvé", "proven") not found in `about.*`. |
| R-ABOUT-05 | B | Both languages are complete and use the `{brand}` argument; no hard-coded product name. | Unit: same key set in fr and en; no occurrence of any name in `BRAND.previousNames` (extends R-OPS-03). |
| R-ABOUT-06 | B | Links to the page exist from Paramètres (group Aide), the landing footer and `/help`; the nav bar still has five links. | e2e: each link navigates to `/about`; the signed-in nav bar contains exactly the five existing links. |
| R-ABOUT-07 | B | R-UI-02 and R-UI-03 hold on the page in every style, light and dark: every standalone link and summary is at least 44 px tall, no horizontal scroll at 375 px, visible focus. | e2e at 375 x 812 in signal, revue, cahier, bristol: bounding boxes of links and summaries at least 44 px; `scrollWidth` not above the viewport. Existing stylesheet test stays green with any new class listed. |
| R-ABOUT-08 | B | The page works without JavaScript (no client component, details open natively). | e2e with JavaScript disabled: page renders, `<details>` opens by keyboard. |
| R-ABOUT-09 | B | Limits section is present in both languages and cannot be collapsed. | e2e: heading "Limites" / "Limits" visible, not inside a `<details>`. |

All tests are tagged in their titles (`[R-ABOUT-02]`) so `pnpm status` picks them up. None of these rows may be marked done in docs until its test exists and passes.

## 9. Open questions for Hugues

1. Public or signed-in only? Proposed public (so the landing can link to it). If you would rather keep the beta closed, signed-in only costs nothing in the design.
2. Do you want the page at all before the first sources are verified? The two core sources (Dunlosky review, Roediger and Karpicke) have no URL or DOI in the research files. A short verification session (open the PSPI review, the Roediger and Karpicke paper, record URL and DOI in the source log) is a prerequisite for sections 2 and 3.
3. Primary review versus the Scientific American summary: the research file says the figures are secondary and that the primary review is not ingested. Should we ingest the primary first, and cite the review rather than the magazine article?
4. Should section 5 (human in the loop) say anything beyond "product choice"? A sourced claim needs a source on generating or selecting your own study material; none is recorded.
5. Which FSRS algorithm version does ts-fsrs 5.4.2 implement? `FSRS_VERSION` in `src/domain/scheduling.ts` records the package version "5.4.2", not the algorithm version, and the research files only say libraries vary from v4 to v6. The page avoids a version number; do you want one (needs a check of the ts-fsrs README or source)?
6. The optional figures (35 % vs 4 %, 47 % vs 37 %): leave out (my default) or include with the "études isolées" line?
7. Should the English copy be a translation or an adaptation? (Draft proposal: a translation, same sources.)
8. Section 6 (budget) and a possible later section on short, single-fact cards (minimum information principle, source to record): keep, cut, or later?
9. Do you want a forgetting-curve picture drawn from the FSRS formula (labelled as an illustration), or text only for the first version?
10. Name check: while the product name is the temporary Memento (D49), the page uses `{brand}` everywhere. Confirm nothing on the page should be written as if the name were final.
