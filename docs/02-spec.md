# LeitnerBox V2 — Product Specification

> Status: **draft v0.2, 2026-10-14**. Decisions live in [decisions.md](decisions.md) (D1–D20). Implementation plan: [03-plan.md](03-plan.md). The rationale is in [00-v1-analysis.md](00-v1-analysis.md) and [01-critical-review.md](01-critical-review.md).
> Research is cited by page id from the owner's private research notes: `cognitive-science-education` (FSRS, study techniques) and `ai` (model selection). Numbers are not copied here, because they go stale.
>
> **How to read this file:** each requirement has an ID (`R-AREA-NN`), a phase tag, and an acceptance criterion (**AC**). A requirement is *done* only when its AC is covered by a passing test or a recorded manual check.
> **Phases:**
> - `[S]` walking skeleton: Hugues alone, no domain.
> - `[B]` friends beta: before the first other user.
> - `[L]` later.

---

## 0. Product in one paragraph

LeitnerBox turns whatever you send it into a personal knowledge base, then makes sure you remember it. You email it a link, an article, a PDF, a photo, or two lines like "I went to the Warhol exhibition". It files the material into **topic pages**: your knowledge base, compiled across everything you've sent, with citations. It then **proposes flashcards**, which you keep or discard in a quick **tray**. An FSRS scheduler brings the kept cards back just before you'd forget them. Reviews fit a time budget you choose, 10 minutes a day by default.

**Core job:** long-term memory of what the user chose to learn.
**North-star metric:** cards recalled correctly at their due date, per minute of review, measured on mature cards.

## 1. Glossary

| Term | Meaning |
|---|---|
| **Capture** | One inbound item as received: an email with its body, attachments and links. Raw and immutable. |
| **Source** | One thing learned from, extracted from a capture: an article, PDF, video, image, or the user's own note. Immutable after extraction. A capture can yield several sources. |
| **Topic page** | A page of the user's knowledge base about one subject. It is compiled and updated across sources, and versioned. |
| **Claim** | One atomic statement on a topic page. It carries its citations and its origin: `source`, `model` (from the AI's own knowledge) or `web` (from a web search). This is the unit cards are anchored to. |
| **Card** | A question/answer pair anchored to one claim. Statuses: `proposed`, `active`, `suspended`, `retired`. |
| **Tray** | The queue of proposed cards waiting for the user's keep / edit / discard decision. |
| **Review** | One graded answer to a card: Again, Hard, Good or Easy. |
| **Budget** | The user's daily review time (3, 6, 10, 15 or 20 min) and study days. |
| **Deepen** | A user request for more depth or more specific cards on an existing topic or claim. |

## 2. Principles (apply to every requirement)

1. **Push, not pull.** The product comes to the user through email. The user never has to remember to open the app.
2. **Selection over accumulation.** The user decides what enters their review queue (the tray). Workload is governed by the time budget, never by how much was captured.
3. **Everything is traceable.** Every claim cites its source passage, or is visibly marked as AI-added. Every card points to its claim.
4. **Cards are stable; pages evolve.** Knowledge-base edits never silently change a card that has review history.
5. **Fail loudly and visibly.** Every capture gets a receipt, success or failure. No silent drops (V1 had several).
6. **Cost is a feature.** Every AI call is logged with its cost. The design target is a few cents per user per day (D11).
7. **Nothing is "done" without a test.**

---

## 3. Accounts and settings — `R-ACC`

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-ACC-01 | S | Sign-in by a **6-digit code** mailed to the account address and typed into the app (D57: the mail has **no token link**, because a mail scanner that opens it uses up the code too). Only the code of the latest mail works; the code screen offers a new code, and a code typed with no pending address (other tab or browser) asks for address and code together. | The code logs in; it expires in 15 min or less; single use; the sign-in mail contains no token link and its code still works after every link in it was opened; an old link that was already used says so and offers a new code; a wrong code offers a new code. |
| R-ACC-02 | B | Sign-up only through a universal invite link (D52): a secret link with an expiry and a maximum number of sign-ups, revocable, hashed in the database, rate limited. | An unknown, expired, revoked or used-up link gets a polite refusal and no account; the use counter never exceeds the maximum under simultaneous requests. |
| R-ACC-03 | S | UI language FR (default) or EN, switchable in settings. | All UI strings come from translation files; switching changes every screen; no hard-coded strings (lint check). |
| R-ACC-04 | S | Timezone auto-detected at sign-up, editable. | Reminder times and "today" respect it (see R-NOT-02). |
| R-ACC-05 | S | Budget settings: daily minutes ∈ {3, 6, 10, 15, 20} (default 10); study days (default all 7 days; the user can reduce them); max new cards per day (default 5). | Values outside the allowed sets are rejected by the server. |
| R-ACC-06 | S | Desired retention: default 0.90, editable within [0.80, 0.95]. | Out-of-range values are rejected. The UI explains that a higher value means more reviews. |
| R-ACC-07 | B | Linked sender addresses: a user can register extra "from" addresses for capture. Each must be **verified** by a link sent to that address. | An unverified address cannot capture. Verification needs a token from the mail, not just the session. |
| R-ACC-08 | B | **Paramètres is grouped** (D58): Révisions, Rappels par e-mail, Langue, then Apparence, Aide and Compte, with one `h2` per group; Révisions, Rappels, Langue and the advanced menu are one form with a single "Enregistrer" button; invalid values are refused by the server as before (R-ACC-05/06); the reminder option is applied only when it differs from the one in force. | e2e: the six groups appear in order; one save stores time, study days, reminder option and language together; saving another setting leaves a running pause date unchanged; without JavaScript the form still saves and an invalid advanced value reopens the advanced menu. Unit: `reminderUpdate` returns null for the current option. |
| R-ACC-09 | B | **The data links and the advanced settings are in closed menus** (`<details>`): download my data, delete my account and privacy; retention and timezone. They open from the keyboard and work without JavaScript. | e2e: hidden on load, visible after Enter or Space on the summary; export still downloads; delete still needs the typed address (R-SEC-06). |
| R-ACC-10 | B | **Clear resend wait on sign-in** (D60): when Auth answers 429 to a code request, the message says how many seconds to wait (the number in Auth's message, 60 if absent); after a code is sent, "Recevoir un nouveau code" shows a 60-second countdown and is not clickable until it ends; without JavaScript it stays a normal link. | The number is parsed from the message (unit test); a second request within the limit shows "Réessaie dans N secondes"; the countdown is visible and decreases (e2e). |
| R-ACC-11 | B | **`/join` sends existing users to `/login`** (D60): the page says an existing account should use the sign-in page, with a link, and the join rate-limit error says the same, so they do not use up the per-address join quota. The answer stays identical for known and unknown addresses (D28). | The join page shows the note and a working link to `/login` (e2e). |
| R-UI-03 | B | **Pills and menu titles meet R-UI-02**: native radios and checkboxes laid over their labels, checked state shown by fill and a check mark, visible focus, 44 px tall, no horizontal scroll at 375 px, in every style, light and dark. | e2e at 375 px: every pill, summary and button is at least 44 px tall and the page is not wider than the viewport; manual look in signal, revue, cahier and bristol. |

## 4. Capture — `R-CAP`

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-CAP-01 | S | Each user has a **personal capture address**. In [S] this is `<token>@<id>.resend.app` (Resend's receiving domain, no custom domain needed, D10). In [B] it moves to the product's own domain. **[S] limitation:** without a domain, Resend can only send mail to the account owner, so receipts and reminders work for Hugues only until [B]. | Mail sent to the address creates a capture for that user within 5 min. |
| R-CAP-02 | S | A capture is accepted only if the sender is the user's account email or a verified linked address (R-ACC-07). Mail from anyone else is stored as `rejected` and never processed. | A test with a foreign sender produces no source, no AI call and no card. |
| R-CAP-03 | S | Sender authentication: mail whose provider-reported DKIM result is `fail` is rejected on the token path, and anything other than `pass` is rejected on the shared `add@` path (R-CAP-12), before any AI call. SPF and DMARC are not required (D50). | Test mail with DKIM fail, gray or missing: `rejected`, no job, no AI call. **Built and tested 2026-10-16 (D51):** unit (`authDecision`, Resend `authentication` parsing) and integration (`tests/integration/shared-address.test.ts`): shared path gray, fail, processing_failed, unknown, missing and still-processing end `rejected` with no extract job, no AI call, no mail; token path refuses fail, accepts gray and pass. "No job" means no job after `fetch`, where the check runs. Not yet seen on real mail. |
| R-CAP-04 | S | The raw capture is stored **before** any processing, and the call returns at once. Processing is asynchronous (R-PIPE). | Killing the processing worker loses no capture. |
| R-CAP-05 | S | Idempotency: the provider message id and a content hash are unique per user. A re-delivered mail is not processed twice. | Delivering the same message twice gives one capture. |
| R-CAP-06 | S | Every capture that **fails** sends one **failure receipt email** saying what went wrong in plain words and what to do. A success or a duplicate sends no mail (D59, 2026-10-17): it shows in the "Mails reçus" list (R-TRAY-07). | A failed capture sends exactly one receipt; a done or duplicate capture sends none. |
| R-CAP-07 | S | Supported in [S]: plain-text and HTML body, links in the body, PDF attachments, image attachments (photos, screenshots). [B]: YouTube links. [L]: audio and other formats. | Each type has a fixture in the test suite. An unsupported attachment is listed as "ignored" in the receipt. |
| R-CAP-08 | S | The user's own words in the email are kept as the **user note** of the capture: the subject plus any text that is not forwarded content. It is used both as an instruction ("focus on X") and as a source in its own right ("I went to the Warhol exhibition"). | Fixtures: link-only mail, forwarded newsletter, two-line personal note, note plus link. Each yields the expected sources and instructions. |
| R-CAP-09 | S | Forwarding wrappers, signatures, tracking pixels and newsletter footers are stripped before extraction. | Fixture newsletters produce no footer text in the source. |
| R-CAP-10 | S | Limits: attachments ≤ 25 MB each [proposed default]. Sources above a token threshold go to the long-document policy (R-PIPE-06). | An oversize attachment gives a failure receipt, not a crash. |
| R-CAP-11 | B | A reply to a receipt or reminder email is parsed as a command (e.g. "more on the silkscreen technique" means Deepen, R-DEEP). | Fixture replies map to the right command, or to "not understood" with help text. |
| R-CAP-12 | S | Shared capture address `add@<capture domain>`: the user is the one whose account email equals the From address, accepted only when DKIM passes (R-CAP-03). Token addresses keep working. Unknown or unauthenticated senders: nothing stored, no reply. The home page shows `add@` first and the token address as a fallback. | Tests: account From with `dkim=pass` creates a capture; `gray`, `fail` or missing gives `rejected` and no AI call; unknown From creates no row; old token addresses still work. **Built and tested 2026-10-16 (D51):** integration (account From with dkim pass gives a processed capture; rejects as in R-CAP-03; unknown From, `add+x@` and `add@` on a foreign domain store nothing; another user's From through someone's token is rejected under the token owner; `resend.app` and `mailtomemento.com` tokens still work), unit (`add@` parsing), pgTAP (`capture_user_by_email`: case, no dot folding, not callable by anon or users), e2e (home shows `add@` first, token under "Autre adresse"). Not yet verified with real mail. |
| R-CAP-13 | B | A rate-limited reply to an unknown sender who passed DKIM, telling them to sign in and link the address (needs R-ACC-07). Never contains content. | One reply per address per day; no reply on DKIM failure. |
| R-CAP-14 | S | The number of cards the user asks for is read from their own words, deterministically (a pure function, no model), in **French and English**: digits or number words (un..trente, one..thirty) next to cartes / cards / flashcards / questions, or after a verb of asking (crée, fais, génère, donne, make, create, generate, give). It reads the personal note (subject plus body) and then the instruction around a link, PDF or forward; the first valid request wins. Clamped to 1..30. No misfire on years ("2022 cards"), durations ("in 10 minutes"), phone numbers, decimals or 0; "fiches" are not cards (D55); "une carte" and "questions" count only after a verb of asking. | Exhaustive unit tests of `parseCardRequest` including misfire cases; integration: link and PDF with the request in the user's words. |

## 5. Processing pipeline — `R-PIPE`

Stages, each an idempotent job with stored output, status and retries:
`capture → extract sources → language + dedup → match topics → update knowledge base → propose cards → receipt`

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-PIPE-01 | S | Each stage is a separate job. Failures retry up to 3 times with backoff, then mark the capture `failed` and send a failure receipt. | Fault-injection test: a transient AI error recovers; a permanent one ends with a receipt. |
| R-PIPE-02 | S | URLs are **fetched** and the readable text extracted. The extracted text is stored as the source snapshot (the page may change later). Paywalled or empty pages give a receipt asking the user to paste the text. | Fixtures: an article, a JS-heavy page, a paywall. |
| R-PIPE-03 | S | Exact duplicates (the same URL after normalisation, or the same content hash) are detected. The receipt says "already in your knowledge base" and offers Deepen. | Sending the same link twice gives no new cards. |
| R-PIPE-04 | S | The source's language is detected and stored. Claims, pages and cards derived from it are written in that language (D4). | Fixtures in FR and EN; a mixed-language user base works. |
| R-PIPE-05 | S | **Sparse input** (a user note with little or no content, e.g. "I read about General Leclerc's 2nd Armoured Division") triggers **enrichment**. The AI drafts claims from its own knowledge (origin `model`). In [B], enrichment may use web search, giving origin `web` with the web pages registered as sources. | Every enriched claim has the right origin. In the UI, model-origin claims and their cards carry a visible badge. |
| R-PIPE-06 | S | **Long documents** (above a token threshold, set from the eval) are not compiled whole. The system extracts an outline, compiles a first pass on the main points, and the receipt offers to go deeper on chosen chapters (via Deepen). | A 100-page PDF fixture yields at most the per-source card cap (R-CARD-04) and a chapter list. |
| R-PIPE-07 | S | Each AI call goes through one gateway. The gateway logs the model, prompt version, input and output tokens, cost, latency and user. It validates the output against a schema and retries on invalid output. | No AI call bypasses the gateway (code check). Invalid JSON never reaches the database. |
| R-PIPE-08 | S | The model for each stage is configuration, not code (routing table, §14). | Changing the model of one stage needs no deploy. |

## 6. Knowledge base: sources, topic pages, claims — `R-KB`

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-KB-01 | S | Sources are immutable after extraction. They store: kind, title, URL if any, language, extracted text, content hash, extractor and version, capture date. Originals (PDF, image) are kept in blob storage. | No update path exists for source text. |
| R-KB-02 | S | **Topic matching.** For each new source the system finds candidate existing pages (by embedding and summary similarity), then decides: update existing pages, create new pages, or both. A source may touch several pages. | Eval fixtures: a book, a documentary and a museum note on one subject end in **one** page cluster, not three duplicates. |
| R-KB-03 | S | **Structured updates only.** The AI returns operations, not rewritten pages: `add_claim`, `revise_claim(id, text, reason)`, `flag_contradiction(id, new_data, source)`, `create_page`, `link_pages`, `add_open_question`. The system applies them. Free-text page rewrites are forbidden. | Each operation type has a test. A rewrite-style output is rejected by schema validation. |
| R-KB-04 | S | Every page change creates a new page version with its cause (capture id or user edit). Any version can be restored. | Restore works, and the cards anchored to restored claims are unaffected. |
| R-KB-05 | S | Claims are atomic (one fact each) and carry citations: source id plus a locator (quote excerpt, page number or timestamp). A claim with origin `source` must cite at least one source. | Validation rejects uncited `source` claims. |
| R-KB-06 | S | **Contradictions** are never silently overwritten. Both data points are kept on the claim, with their sources, and shown to the user. | A fixture with two conflicting dates shows both, plus a flag. |
| R-KB-07 | S | Each page has: a title, a short summary (3–7 bullets, used for matching), sections of claims, links to related pages, open questions, and a change history. Pages have a hard size limit; above it the AI must propose a split. | Generation never exceeds the limit (validator). |
| R-KB-08 | S | The user can read, search (full text, in any language) and browse pages. Browsing works by recent, by alphabet, or through linked pages. | Search finds a word in a claim, a title, or a source title. |
| R-KB-09 | B | The user can edit a page's claims by hand (fix, delete, add). Edits follow the card-lineage rules (R-CARD-06). | Editing a claim with an active card asks "minor fix (keep history) or new fact (new card)?". |
| R-KB-10 | B | **Deleting a source** retires claims supported only by that source, and their cards. Claims with other sources lose only that citation. The user sees what will be removed before confirming. | Fixture: deleting one of two sources leaves the shared claims intact. |
| R-KB-11 | L | Optional collections or tags on pages for filtering, and pausing a collection's reviews. | — |

## 7. Cards and the tray — `R-CARD`, `R-TRAY`

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-CARD-01 | S | Default card type: **flip card**. The question is shown, the user recalls, reveals the answer, and grades Again / Hard / Good / Easy (D13). | — |
| R-CARD-02 | B | Additional types: **cloze** (fill the gap) and **why-card** ("Why is X true?", elaborative). Per-user option: typed answers graded by AI. The AI's verdict maps to a grade, and the user can always override it. | The override is stored separately from the AI verdict. |
| R-CARD-03 | S | Card quality rules, enforced in the prompt **and** by a validator where checkable: one fact per card; self-contained (understandable months later with no context: no "according to the article"); answer supported by the anchored claim; no yes/no questions; no unrequested trivia (exact dates or figures); a single defensible answer. | The eval measures the violation rate (R-EVAL). Validator checks: answer length, banned phrases, yes/no detection. |
| R-CARD-04 | S | Cards are proposed **ranked by importance**. The number per source is set by the source's richness: **typically 4–5, hard maximum 8** (D20), unless the user asks for a number in their mail: then that number, up to 30 (R-CARD-08, D64). A two-line note may yield 1–3. Further candidates are kept as "more cards available" on the page. | A long source never floods the tray. |
| R-CARD-05 | S | Each card has a stable id, its anchor claim id, a version number and a status. | — |
| R-CARD-06 | S | **Lineage rules:** a typo or wording fix creates a new card version and keeps the review history. A change to the fact being asked retires the old card and creates a new one, whose history starts at zero. A claim revised by the AI **never** auto-edits an active card: it puts a "card update proposed" item in the tray. | Tests for each case. |
| R-CARD-07 | S | During review, the user can suspend a card ("stop asking this") or edit it (lineage rules apply). | — |
| R-CARD-08 | S | An explicit number of cards in the user's own words is honoured up to **30** (`MAX_REQUESTED_CARDS`), also when it is below the default ("just 2 cards" gives at most 2). The cap is the requested number, not 8. Without a number nothing changes (default cap 8, same prompt wording). The request reaches enrichment, quoting and card prompts (prompts v3, `{{requested}}`), and the schema ceilings leave room for it (D64). | Tests: a note asking for 10 where the provider returns 10 valid cards stores 10; asking for 2 keeps 2; without a request the cap stays 8 and the v3 prompts render the v2 wording; validator with max 12 and 30; schema limits. |
| R-CARD-09 | S | When fewer solid facts exist than the number asked, Memento first writes one card per good claim, then for the **most important claims** (rank order) a **second card testing a different angle** of the same fact: not a rewording, not a trivial reversal, not a yes/no. It never invents facts and never pads with weak cards beyond that; if still short it creates fewer (R-CARD-10). The validator refuses a second card that repeats the first: same normalised question, or same answer text for the same claim, counts as `duplicate`. | Unit tests of the duplicate-angle guard (case, accents, punctuation; same claim and answer; same answer on two claims allowed); the prompt text is tested for the second-angle and no-invention wording. |
| R-CARD-10 | S | When fewer cards come out than the user asked for, the shortfall is recorded as **counts only, no text** in `capture.notes.cards = { requested, kept, dropped: { reason: n } }` (reasons: `empty`, `too_long`, `no_question_mark`, `yes_no`, `context_reference`, `about_the_author`, `duplicate`, `over_cap`, `invalid_claim`, `not_enough_facts`), logged as a structured `cards_shortfall` event, shown as an extra line in the "Mails reçus" list (R-TRAY-07, e.g. "10 demandées, 6 créées : 2 doublons, 1 question oui/non, 1 pas assez de faits") and added to the `pnpm ops` aggregates (R-OPS-02). | Integration: 6 valid of 10 requested records `{ requested: 10, kept: 6, dropped: { duplicate: 2, yes_no: 1, not_enough_facts: 1 } }`; unit tests of the counts; ops report test; e2e: the row shows the line in French. |
| R-TRAY-01 | S | The tray lists proposed cards **grouped by source**, newest first. Each card offers: keep / edit-then-keep / discard. Each group offers "keep all" and "discard all". | Kept cards become `active` and enter scheduling as new cards. |
| R-TRAY-02 | S | A kept card does not have to start today. New cards enter reviews according to the new-card allowance (R-SCH-04). | Keeping 40 cards doesn't add 40 reviews tomorrow. |
| R-TRAY-03 | S | The tray also shows "card update proposed" items (R-CARD-06) and contradiction flags that affect active cards. | — |
| R-SCH-07 | S | `previewIntervals` returns, for each grade, the time until the card is due again, computed by `applyReview` itself (same version, fuzz off). | Unit: equals the stored result for new, learning, review and relearning cards; never decreases from À revoir to Facile; À revoir stays under a day; unit boundaries and fr/en formats. |
| R-REV-06 | S | After the answer is shown, each grade button shows its interval ("10 min", "4 j", "2 mois"), visible on a phone in every style, with a long form ("dans 4 jours") for screen readers. The middle grade is "Correct" and the hints say "Retrouvé…". | e2e: four intervals shown for a new card, the stored due date matches the one shown, the long form is in the button. |
| R-UI-04 | S | The logo is a vector (`public/logo.svg`, `src/ui/logo.tsx`) with no background; the tab icon (`app/icon.svg`) sits on the default style's paper colour, light and dark. In the signed-in nav the name's first letter M is the logo's M and the wordmark is large (at least 28 px on a wide screen); the full name stays readable to screen readers. | Unit: logo.svg has no rect, icon.svg has both paper colours; e2e: the nav wordmark has the logo svg and a font size of at least 28 px. |
| R-TRAY-06 | S | "Tout supprimer" on a source asks for confirmation (a dialog saying how many cards waiting for validation will be deleted, with Annuler). Without JavaScript the button still deletes at once. | e2e: Annuler keeps the cards, the confirmation deletes them. |
| R-TRAY-07 | S | The end of À valider lists the user's last 20 received mails (rejected ones hidden) with date, subject and status (reçu, en cours, traité, échec, déjà dans ta base) and notes for a partial reading or ignored items (D59), and, when fewer cards were made than the user asked for, one short extra line with the counts per reason (R-CARD-10). | e2e: rows and statuses shown, a rejected mail is not listed. |
| R-TRAY-04 | B | Proposals untouched for 30 days [proposed default] collapse into "older proposals" (not deleted), so the tray stays short. | — |
| R-TRAY-05 | B | Optional per-user auto-keep for a capture type (e.g. "my own notes"). Off by default. | — |

## 8. Scheduling — `R-SCH`

Based on FSRS (D5). Background is in the owner's private research notes `[[fsrs-spaced-repetition]]` and `[[ssp-mmc-scheduling]]`.

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-SCH-01 | S | Use a maintained FSRS library (TypeScript: `ts-fsrs` if the stack is TS), with the **FSRS version pinned**. The version is stored with every user's parameters. | Upgrading the version is a deliberate migration. |
| R-SCH-02 | S | Every review is stored in an append-only **review log**: card id and version, rating, review time, elapsed days, state before and after, answer duration, and the AI verdict if any. | The log can rebuild every card's state from scratch (replay test). |
| R-SCH-03 | S | Learning steps for new or lapsed cards stay within the same day (under one day, per the Anki guidance in the FSRS page). | — |
| R-SCH-04 | S | **New-card allowance (D14).** Each study day: allowance = min(user's max new cards, what fits in the budget once forecast reviews are counted). Forecast review time = due reviews × the user's median seconds per review (default 10 s [assumption, replaced by measurement]). | Simulation test: with 5 new/day, 10 min, 5 days a week, steady-state daily time stays ≤ budget. |
| R-SCH-05 | S | **Study days.** Reminders and the allowance apply only on study days. Cards due on other days carry over. Carried-over load is spread across the next study days. Overdue cards are ordered by an FSRS-sensible rule (to verify: ascending retrievability vs. due date). | Simulation: after 2 off days, no study day exceeds the budget by more than 50% [proposed tolerance]. |
| R-SCH-06 | S | A session never silently exceeds the budget. When the budget is reached, the app says so and offers "continue anyway" or "stop". | — |
| R-SCH-07 | B | **Pause / holiday.** The user pauses reminders for a period. On return, the backlog is spread with the R-SCH-05 rules. No "date freezing": FSRS handles late reviews. | Simulation: 14-day pause, return without an avalanche. |
| R-SCH-08 | L | Per-user parameter optimisation, run monthly once the user has ≥ 1,000 reviews (the conservative RemNote threshold; Anki says a few hundred). The new parameters are used only if they predict better on held-out reviews. | — |
| R-SCH-09 | S | The "Leitner box" display is a view of FSRS stability buckets (e.g. box 1 < 1 day … box 9 ≥ 1 year [proposed boundaries]). It is never a scheduling rule. | — |

## 9. Review experience — `R-REV`

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-REV-01 | S | Mobile-first web app (installable PWA). It works on current iOS Safari and Android Chrome. | Manual check on both before [B]. |
| R-REV-02 | S | A session shows due cards, then new cards, within the budget (R-SCH-06). It can be resumed after closing. | — |
| R-REV-03 | S | The grading buttons carry localised labels with a one-line hint. The UI explains once: "Forgot? → Again, never Hard" (Anki's warning). | — |
| R-REV-04 | S | After **Again**, the app shows the anchored claim, the source excerpt, and a link to the topic page, so the user re-learns rather than just seeing the answer. | — |
| R-REV-05 | S | The reminder email contains a **deep link** that opens the session directly. The link carries a signed token: valid 24 h, usable only for that user's review session, no other access. | An expired or tampered token goes to login. The token cannot read pages or settings. |
| R-REV-06 | B | Free-text answers graded by AI judge meaning, not spelling: accents, synonyms, the language of the answer vs the card. | Eval fixtures in FR and EN with accent variants. |

## 10. Reminders and emails — `R-NOT`

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-NOT-01 | S | On each study day, at the user's chosen local time (default **18:00**, every day by default), a reminder email is sent **only if** there is something to do. It shows the number of cards due, the estimated minutes and the tray count, plus the deep link. | No email on non-study days or when nothing is due. |
| R-NOT-02 | S | The scheduler runs at least hourly and sends to the users whose local reminder time falls in that hour. | Users in 3 timezones receive mail at their local time (test). |
| R-NOT-03 | S | Every outbound email is logged (type, user, status). No user gets two reminders on the same day. | Running the job twice sends once. |
| R-NOT-04 | B | Emails are sent from the product domain with SPF, DKIM and DMARC. One-click unsubscribe and pause. | Mail-tester check before [B]. |
| R-NOT-05 | B | A weekly summary (optional): what you learned, retention, upcoming load. | — |

## 11. Deepen — `R-DEEP` (D15)

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-DEEP-01 | B | From a topic page or a claim, the user can ask for more ("more specific questions", "go deeper on X", "cover chapter 3"). The request is free text plus the target. | — |
| R-DEEP-02 | B | Deepen uses the existing sources first. If they are exhausted, it uses enrichment (R-PIPE-05, with the same origin badges). The output is new claims (structured operations, R-KB-03) and **proposed cards in the tray**. | Deepen never activates cards directly. |
| R-DEEP-03 | B | Deepen is also reachable by replying to a receipt or reminder email (R-CAP-11). | — |
| R-DEEP-04 | L | Ask: a question-and-answer chat over the user's own knowledge base, with citations. | — |

## 12. Dashboard — `R-DASH`

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-DASH-01 | S | Shows today's due cards with estimated minutes, the tray size, and the next 7 days' load. | — |
| R-DASH-02 | B | Shows **true retention**: the share of reviews of mature cards (stability ≥ 21 days [proposed]) graded Good or Easy, over the last 30 days. Also shows cards by box, and pages and sources counts. | The formula is unit-tested. No "average of last scores" metric (V1's mistake). |
| R-DASH-03 | L | Streak (optional, user can hide it). | — |

## 12a. Look and accessibility — `R-UI` (D46, D48)

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-UI-01 | S | Several styles on one markup, picked in Réglages and kept in a cookie: **"signal"** (default: Swiss poster, big grotesk, flat colour grade blocks), **"revue"** (editorial serif page, footnoted excerpts), **"calme"** (quiet and very legible: Atkinson Hyperlegible, hairlines, one green accent, outlined grade rows) and **"recre"** (playful: Lexend, tiles with a thick bottom edge, lip buttons, filled colour grades). The older "cahier" and "bristol" were retired with D68. Light and dark follow the system. Each style loads only its own self-hosted OFL fonts. Card text keeps French spacing rules on display. Later (not built): the next interval under each grade, Anki style, which needs the four FSRS next-due dates from the server. | Unit: signal is the default and the fallback for an unknown cookie; the four styles are accepted; each has its own stylesheet block, a French and English label and a theme colour; every font file referenced exists with its OFL licence; French spacing helper. E2e: default signal, switching to revue, cahier and bristol in Réglages sets `data-style` and the cookie and survives a fresh load. **Done 2026-10-16: unit (219 pass) and e2e (22 pass, including the style switch) green on the merged main.** Font loading per style and layout at 375 and 1280 px were checked by hand on screenshots, not by a test. **Built and tested 2026-10-21 (D68, not deployed):** calme and recre added, cahier and bristol removed (an old cookie falls back to signal). Unit: four styles in order, labels in both languages (calme / récré, Calm / Playground), theme colours, fonts and OFL texts, contrast of every token (light and dark; Récré light red and blue one step darker than the mockup). e2e: switching to revue, calme and recre in Paramètres (tests/e2e/settings.spec.ts), and at 375 px in calme and recre on home, tray, review, topic, pages and Paramètres: buttons and standalone links at least 44 px, French nav labels on one line, no sideways scroll (tests/e2e/styles.spec.ts). **Font bytes measured on French pages (signal, revue, calme, recre):** 117, 318, 51 and 39 KB. |
| R-UI-02 | S | Accessibility basics: touch targets of at least 44px, visible keyboard focus, contrast of body text at least 4.5:1 in light and dark. | Tap size, focus rule and ink-on-paper contrast of every style token (light and dark) checked by a unit test on the stylesheet; also every `--on-X` text colour on its `--X` block (grade blocks, primary buttons, highlighted excerpts). Tested and passing for all four styles (2026-10-16; the four are now signal, revue, calme and recre, D68). |

## 12b. Onboarding and help — `R-ONB` (D47, proposed)

> Design rules for every `R-ONB` item: the tutorial lives in the app's own screens, in the study look (R-UI-01), as plain text and lists: no screenshots, no modal, no carousel, no coach marks pointing at buttons. Nothing is demo data: the only "try it" path sends a **real** note (R-ONB-04), so FSRS state, the review log and the north-star metric never contain fake cards. Strings live in `messages/{fr,en}.json` under `help`. UI labels quoted in the tutorial (nav names, grade names, the AI badge, buttons) are **not copied**: the help text takes them as ICU arguments filled from the screens' own keys (`nav.tray`, `review.again`, `tray.badgeModel`…), and facts that are numbers or personal data (capture address, reminder time, sources per mail, link validity, file limits, budget presets, the user's budget) are arguments filled from the code constants or the user's profile. Renaming a button or changing a limit therefore updates the tutorial with no edit to `help`.

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-ONB-01 | B | **Help page `/help` ("Comment ça marche" / "How it works")**, signed-in only (signed-out visitors go to login, like every screen but login). Five numbered sections, each an `h2` in an ordered list: (1) **Envoyer**: the user's own capture address (copy button), send only from the account address, what can be sent (a note of a few words, a link, a PDF, a photo or screenshot; up to N sources per mail), the receipt mail that follows each send, and what a failure receipt means; (2) **À valider**: proposed cards wait there, keep / discard / keep all, nothing enters reviews without being kept, the AI-added badge means "from the model's knowledge, not from your source"; (3) **Réviser**: show the answer, the four grades with their hints and the rule "forgot → À revoir, never Difficile" (R-REV-03), the daily time budget, new cards held back when the day is full, the budget stop with "continue anyway", edit and "stop asking this"; (4) **Le rappel**: sent at the user's reminder time on study days only when something is waiting, its link opens the session without signing in for N hours, and that link can only review (no edit, no suspend, no pages, no settings); (5) **Pages et Réglages**: every send creates or enriches a topic page with its sources; what each setting changes. Reached from: Réglages (link at the top), the first-run card (R-ONB-02), the empty states of À valider and Fiches, and the home page footer next to "sign out". **Not in the nav bar** (6 links do not fit a 375 px bottom bar at 44 px targets, R-UI-02). [OPEN: a `?` link in the nav bar instead of the home footer.] | e2e (FR and EN): signed in, `/help` shows the user's real capture address, their reminder time formatted in their locale, the 5 section headings in order, and the current `nav.tray` and `review.again` labels; signed out, `/help` redirects to login; Réglages, the empty tray and the empty pages list link to `/help`. |
| R-ONB-02 | B | **First-run card on the home page ("Premiers pas")**: a checklist of three steps whose ticks come from the user's own data, not from stored progress: (a) a first capture received (any capture row, whatever its status), (b) a first card kept, (c) a first review done. Each item says what to do next and links to the place to do it (the address, `/tray`, `/review`); a link "Comment ça marche" goes to `/help`. The card is shown above "Aujourd'hui" content while at least one step is open and the user has not dismissed it; it disappears for good once the three are done. "Masquer" hides it permanently for the account (on every device) and says where help stays (Réglages). Dismissal is stored as `profile.onboarding_dismissed_at` (migration, user-updatable column grant like the other settings, D29 d). [OPEN: cookie instead of a column; a cookie needs no migration but the card comes back on each new phone or browser.] A user with existing data (Hugues) never sees it. | Integration or e2e with seeded users: a new user sees 3 open steps; after a capture, a kept card, a review, the ticks follow and the card is gone after the third; a user with all three never sees it; "Masquer" hides it on a second browser context of the same account; ticks are text ("fait" / "à faire") as well as the checkbox mark. |
| R-ONB-03 | B | **The tutorial cannot drift from the screens.** `help` strings never contain a UI label, the capture address, a time, or a limit as literal text; they receive them as arguments (see the design rules above). Same keys in `fr.json` and `en.json` (existing parity test). | Unit test: rendering every `help` message with its arguments succeeds in FR and EN (no missing argument), and the raw `help` strings contain none of the current values of the referenced labels, nor the digits of the referenced constants (`MAX_ITEMS_PER_MAIL`, `REVIEW_TOKEN_TTL_SECONDS` in hours, the file limits, the default reminder time). |
| R-ONB-04 | B | **"Essayer maintenant": a real first note, no demo data.** In the first-run card and section (1) of `/help`, a button opens the phone's or computer's mail app with a `mailto:` link to the user's capture address, a subject and a short suggested note (an experience in two lines, which exercises enrichment and shows the AI badge), editable before sending. Beside it: "send it from <account address>, otherwise it is refused", and "the receipt arrives within a few minutes". No demo card is ever created by the server. | e2e: the button's `href` is `mailto:<capture address>?subject=…&body=…` with URL-encoded localised text, and contains no other personal data; a code check finds no server path that inserts a card outside the pipeline. |
| R-ONB-05 | B | **Accessible and quiet.** The help page and the first-run card are server-rendered and work without JavaScript (dismissal is a form post), never take focus on load, use real headings and lists, and meet R-UI-02 (44 px targets, visible focus, contrast in both styles, light and dark). | Covered by the R-UI-02 stylesheet test for the classes used, plus an e2e keyboard pass: Tab reaches "Masquer", "Essayer maintenant" and "Comment ça marche" in reading order, and Enter on "Masquer" hides the card with JavaScript disabled. |
| R-ONB-06 | B | **Invited users.** The invite mail (R-ACC-02) links to the app with one line: "start with *Comment ça marche*"; the first receipt a new user ever gets ends with a link to `/help`. [OPEN: also a help link in the footer of every receipt and reminder.] | Integration: the first receipt of a new user contains the `/help` link; the second does not. |
| R-ONB-07 | B | **First-sign-in walkthrough shows once (D56).** `/` redirects a signed-in user whose `profile.welcome_done_at` is null to `/welcome/1`. No other path redirects (review links `/r/…`, `/tray`, deep links, the reminder link all work as before). An interrupted visit stores nothing, so `/` offers it again. The migration sets `welcome_done_at` to `now()` for every existing profile. | e2e: a new user lands on `/welcome/1` after sign-in; after "Passer la visite", `/` shows the home page, also in a second browser context of the same account; a user with the flag set is never redirected; `/tray` does not redirect a new user. pgTAP: the column exists, existing profiles are backfilled, an authenticated user can update it on their own row only. |
| R-ONB-08 | B | **Five full-page screens** at `/welcome/1` to `/welcome/5` (`/welcome` goes to 1; any other step is 404; signed out goes to login): welcome, send a note, validate the cards, the reviews and the reminder, your turn. Each has one `h1`, an "x / 5" text, Back (not on 1), Next (not on 5) and "Passer la visite"; screen 5 ends with "Terminer" instead. Skip and Terminer set `welcome_done_at` (only if still null) and go to `/`. Plain links and a form post: works without JavaScript. | e2e with JavaScript disabled: walk 1 to 5 with Next, Back returns, "Passer la visite" on screen 3 stores the flag and lands on the home page; Terminer on 5 does the same; `/welcome/0`, `/welcome/6` and `/welcome/x` answer 404; signed out `/welcome/1` goes to `/login`. Unit: step parsing and neighbours. |
| R-ONB-09 | B | **Replay.** A link "Revoir la visite guidée" in Réglages and at the end of `/help` opens `/welcome/1`. Replaying writes nothing: the flag keeps its value, and Skip or Terminer on a replay only returns to `/`. | e2e: both links open `/welcome/1`; the stored `welcome_done_at` is identical after a full replay. |
| R-ONB-10 | B | **The walkthrough shares the tutorial's text.** Screens reuse the `help` and `onboarding` messages with the same arguments (R-ONB-03); the `welcome` messages hold only titles and button labels, and never a UI label, a digit, an address or a time. | Unit: `welcome` keys equal in fr and en; no `welcome` string contains a `HELP_LABEL_KEYS` label of its language, a digit or `@`; every message renders. |

## 12c. Landing page (R-LAND, D54, proposed)

> Full specification, copy and data model: [landing-spec.md](landing-spec.md). Plan: [landing-plan.md](landing-plan.md). The call to action is a notify-me list (told once when the product opens to everyone), not an invitation request and not an account; sign-ups stay closed (D28, D52). Nothing is sent to the list by this work.

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-LAND-01 | B | `/` shows the landing page to signed-out visitors and the home page (R-DASH-01) to signed-in users. Every other screen still sends signed-out visitors to `/login`; `/login`, `/join/<code>`, `/privacy`, `/u/<token>`, `/r/<token>`, `/help` (signed-in only) behave as before. New public paths: `/notify/confirm/<token>`, `/notify/leave/<token>`. | e2e: signed out, `/` answers 200 with the landing (`data-testid="landing"`), `/tray` redirects to `/login`, `/login` and `/privacy` render; signed in, `/` shows `due-today`. **Built and tested 2026-10-16 (D54, not deployed):** tests/e2e/landing.spec.ts, tests/e2e/auth.spec.ts, tests/unit/landing.test.ts. |
| R-LAND-02 | B | Content, top to bottom: (1) hook: `h1` = `app.tagline`, then one paragraph; (2) the notify form; (3) three steps (send, sort, review) as an ordered list; (4) four differences as a list; (5) beta honesty with a link to `/privacy`; (6) footer: sign in, privacy, language. Strings live under `landing` in both languages. **Sync rule:** the landing describes the product, it does not quote the app: no UI label (the `HELP_LABEL_KEYS` labels), no digit, no address, no time. Labels it shows as its own controls reuse the app's keys (`login.emailLabel`, `login.title`, `account.privacyLink`, `settings.languageFr/En`). | Unit: `landing` keys equal in fr and en; no `landing` string contains a `HELP_LABEL_KEYS` label of its language (case-sensitive), a digit or `@`; every string renders. e2e: the `h1` and the four `h2` in order, 3 steps, 4 differences, footer links to `/login` and `/privacy`. **Built and tested 2026-10-16 (D54, not deployed):** tests/unit/landing.test.ts, tests/e2e/landing.spec.ts. |
| R-LAND-03 | B | The notify form is a plain `<form>` posting to a server action, then a redirect to `/?notify=<state>` (PRG). States: `sent`, `invalid`, `limited`, `failed`. The answer is **the same whether or not the address is already on the list, belongs to an account, or is new**: the submit path never reads the list. A honeypot field (`hp_note`) filled in gets `sent` and nothing else happens. | Integration: a listed and an unlisted address both get `sent` and one mail each with the same subject and the same text once links are masked; honeypot: `sent`, no mail, no rate-limit row. e2e with JavaScript disabled: submit, see the `sent` message, receive the mail (Mailpit). **Built and tested 2026-10-16 (D54, not deployed):** tests/integration/waitlist.test.ts, tests/unit/waitlist-mailer.test.ts, tests/e2e/landing.spec.ts. |
| R-LAND-04 | B | Double opt-in without storing anything first: the confirmation mail carries a **sealed token** (AES-256-GCM, key derived from `REVIEW_LINK_SECRET`, purpose bound, address and language inside, never readable in the URL), valid 3 days. `/notify/confirm/<token>` shows the address and a **Confirm button** (POST; a GET never writes, because mail scanners open links). Confirming inserts the address once (repeat: no change). An invalid, tampered, expired or wrong-purpose token gets a polite message and no button. Secret unset: nothing sent (`failed`), every token invalid. | Unit: seal/open round trip; expired, tampered, other purpose, other secret, unset secret, garbage all give null; the token does not contain the address or its base64. Integration: after `sent`, no row; after confirm, one row with the locale; confirm twice, one row. e2e: bad and expired links show the message and no button. **Built and tested 2026-10-16 (D54, not deployed):** src/server/waitlist-token.test.ts, tests/integration/waitlist.test.ts, tests/e2e/landing.spec.ts. |
| R-LAND-05 | B | Storage: table `public.waitlist`, server-only (RLS on, no policy, like `invite_code`), one row per normalised address. Rows are deleted 12 months after confirmation by a daily job, which also clears rate-limit rows older than a day. | pgTAP: RLS on and no policy; anon and authenticated read 0 rows and cannot insert; duplicate address refused; non-normalised address and unknown locale refused; `purge_waitlist()` deletes the 13-month-old row and keeps the 11-month-old one, deletes old `rate_hit` rows, is not callable by anon; the cron job exists. **Built and tested 2026-10-16 (D54, not deployed):** supabase/tests/waitlist.test.sql. |
| R-LAND-06 | B | Rate limits through `public.rate_check` with hashed keys: 3 requests per address per 24 h, 10 per network address per hour, 20 for the whole site per 24 h. Checked after the honeypot and the address check, in that order: address, network, site. | Integration: 4th request for one address `limited` (no mail); 11th from one IP `limited`; with 50 `waitlist:all` hits, `limited`; no `rate_hit.key` contains the address or `@`. e2e: the 4th submit of one address shows the `limited` message. **Built and tested 2026-10-16 (D54, not deployed):** tests/integration/waitlist.test.ts, tests/e2e/landing.spec.ts. |
| R-LAND-07 | B | Removal: every mail ever sent to the address carries a sealed **leave** link (`/notify/leave/<token>`, valid 2 years) to a page with a "Remove me" button (POST); same answer whether the address was listed or not. A person who lost the mail types the address again and gets a new leave link. The future opening announcement (not built here) must carry the same link plus `List-Unsubscribe` headers. | Integration: leave deletes the row; leaving again, or for an unlisted address, answers `ok`; a confirm token on the leave path is invalid. e2e: confirm from the mail, then the mail's leave link removes the row. **Built and tested 2026-10-16 (D54, not deployed):** tests/integration/waitlist.test.ts, tests/e2e/landing.spec.ts. |
| R-LAND-08 | B | Admin script `scripts/waitlist.ts`: `count`, `list`, `export` (CSV on stdout, formula-safe cells), `remove <email>`, `purge`. Same style as `scripts/invite.ts`. | Unit: the CSV helper defuses formulas and quotes cells; `remove` refuses an invalid address. Manual: one run of each command against the local stack. **Built and tested 2026-10-16 (D54, not deployed):** tests/unit/domain/waitlist.test.ts (CSV); the commands were run once against the local stack only, by hand (manual check, not automated). |
| R-LAND-09 | B | `/privacy` says what the list keeps, why, for how long, and how to leave; the retention number comes from the code constant, which must match the migration. Resend's role mentions the confirmation mail. | Unit: `WAITLIST_RETENTION_MONTHS` equals the interval in the migration; the privacy strings render in fr and en. e2e: `/privacy` shows the waiting-list section with the number of months. **Built and tested 2026-10-16 (D54, not deployed):** tests/unit/landing.test.ts, tests/e2e/landing.spec.ts. |
| R-LAND-10 | B | Quiet and fast: server-rendered, no client component of its own, no analytics, no tracking, no third-party resource; an anonymous `GET /` sets no cookie; the FR/EN switch is a form button that sets only the existing `locale` cookie and returns to `/`. | e2e: no `set-cookie` on an anonymous `GET /`; no `src`/`href` to another host; clicking "English" sets `locale=en` and shows the English `h1`. **Built and tested 2026-10-16 (D54, not deployed):** tests/e2e/landing.spec.ts. |
| R-LAND-11 | B | Accessibility as R-UI-02: targets at least 44 px (inline links inside a sentence excepted, WCAG 2.5.8), visible focus, existing tokens only, real headings and lists, one `h1`, labelled input, result message in a live region, honeypot hidden from screen readers and keyboard. | e2e at 375×812: every button, input and standalone link is at least 44 px tall; first Tab focuses the email field, second the submit button; the honeypot is never focused. R-UI-02 stylesheet test stays green. **Built and tested 2026-10-16 (D54, not deployed):** tests/e2e/landing.spec.ts. |
| R-LAND-12 | B | Link previews: `<title>`, meta description, Open Graph (`og:image` = `/icon.png` 192×192) and `twitter:card=summary`, absolute URLs from `APP_URL`; `robots: noindex, nofollow` while the name is temporary (D49). A 1200×630 image is deferred. | e2e: the head of `/` holds these tags with the expected values. **Built and tested 2026-10-16 (D54, not deployed):** tests/e2e/landing.spec.ts. |
| R-LAND-13 | B | The confirmation mail uses the signal mail layout, no image, no tracking; From is `MAIL_FROM`; it says who asked, the button, the validity, "not you? ignore it", the leave link, and its own footer. Not logged in `email_out` (per-user table; it would store an unconfirmed address); one log line with the provider id and no address. | Unit: fr and en mails contain the confirm and leave URLs, no `{`, no `<img`, the waiting-list footer and not the account footer. Integration: no `email_out` row after a request. **Built and tested 2026-10-16 (D54, not deployed):** tests/unit/mail-layout.test.ts, tests/integration/waitlist.test.ts. |

## 12d. About page (R-ABOUT, D65, decided)

> Design: [about-design.md](about-design.md). Mockup: `mockups/ui/c-signal/about.html`. Public `/about`, not in the nav bar. Every statement is either sourced from a verified entry of `src/config/about-sources.ts` or labelled "Dans Memento" (what the app does). No FSRS benefit claim (D5), no figure except the default retention.

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-ABOUT-01 | B | `/about` is public, server-rendered, French by default and English by the language cookie, with one `h1` and six `h2` in the order of the design (forgetting, testing, spacing, FSRS date choice, cards go through you, few minutes a day), then Limites, then Sources. | e2e: signed out, `/about` answers 200 with the French headings, the English cookie gives the English ones, no redirect to `/login`. **Built and tested 2026-10-20 (D65, not deployed):** tests/unit/about.test.ts, tests/e2e/about.spec.ts. |
| R-ABOUT-02 | B | Every source shown comes from `about-sources.ts` with status `verified` and renders authors, year, title and its exact URL (https, DOI link for papers). Entries marked `to-verify` never render. | Unit: referenced ids exist and are unique, none `to-verify` is rendered, URLs parse as https. e2e: the page's source links equal the constant's list. **Built and tested 2026-10-20 (D65, not deployed):** tests/unit/about.test.ts, tests/e2e/about.spec.ts. |
| R-ABOUT-03 | B | No number without a source: digits in the `about` messages are limited to an allow-list (the default retention, taken from the code constant). | Unit: scan `about.*` in both languages; other digits fail. **Built and tested 2026-10-20 (D65, not deployed):** tests/unit/about.test.ts. |
| R-ABOUT-04 | B | D5 holds: the page never says FSRS needs fewer reviews or is more accurate than another scheduler, or that anything is "proven". | Unit: deny-list of phrases (fr and en: "moins de révisions", "plus précis", "plus efficace", "prouvé", "fewer reviews", "more accurate", "proven") absent from `about.*`. **Built and tested 2026-10-20 (D65, not deployed):** tests/unit/about.test.ts. |
| R-ABOUT-05 | B | fr and en have the same keys; the product name is the `{brand}` argument; the grade labels come from the review messages as ICU arguments. | Unit: key sets equal; no `BRAND.previousNames` entry and no hard-coded current name in `about.*`. **Built and tested 2026-10-20 (D65, not deployed):** tests/unit/about.test.ts. |
| R-ABOUT-06 | B | The page is linked from Paramètres (group Aide), the landing footer and `/help`; the signed-in nav bar keeps its five links. | e2e: each link reaches `/about`; the nav bar has exactly the five existing links. **Built and tested 2026-10-20 (D65, not deployed):** tests/e2e/about.spec.ts. |
| R-ABOUT-07 | B | R-UI-02 and R-UI-03 hold in every style, light and dark: standalone links at least 44 px tall, no horizontal scroll at 375 px, visible focus, 4.5:1 contrast including the role labels. | e2e at 375×812 in each style: link boxes at least 44 px, `scrollWidth` not above the viewport. Contrast test covers the new label and number-square pairs. **Built and tested 2026-10-20 (D65, not deployed):** src/ui/ui.test.ts, tests/e2e/about.spec.ts. |
| R-ABOUT-08 | B | No client JavaScript is needed. | e2e with JavaScript disabled: the page renders fully. **Built and tested 2026-10-20 (D65, not deployed):** tests/e2e/about.spec.ts. |
| R-ABOUT-09 | B | The Limites section is present in both languages and is not collapsible. | e2e: the heading is visible and not inside a `<details>`. **Built and tested 2026-10-20 (D65, not deployed):** tests/e2e/about.spec.ts. |
| R-ABOUT-10 | B | Each part is marked by role with a colour and a text label (never colour alone): "La théorie" (blue), "L'algorithme" (orange), "Dans Memento" (yellow), the section number square and top rule in the section's main role colour. No legend. | Unit: every `about` section declares a role among the three and each rendered role has its text label. e2e: labels present in fr and en. **Built and tested 2026-10-20 (D65, not deployed):** tests/unit/about.test.ts, tests/e2e/about.spec.ts. |

## 12e. Links, open questions, splits (R-KB-12 to 16, R-TRAY-08, D66)

> Design: [m3-step4-design.md](m3-step4-design.md). **Built so far (2026-10-20, not applied to production):** the tables `page_link` and `open_question`, the operations `link_pages`, `add_open_question`, `resolve_open_question` in `applyOps` and `apply_ops`. **Also built (2026-10-20):** the `link` stage in shadow mode (prompt `link/v1`, `src/server/links.ts`, table `link_shadow`, `scripts/show-links.ts`; `LINK_MODE` in `src/domain/page-links.ts` flips it to live) and the read-only blocks "Fiches liées" and "Questions ouvertes" on a topic page. **Not built:** `pnpm eval:link` and its fixtures, the remove and resolve actions, open-question extraction, splits and `tray_item`. A row is done only when every part of its acceptance test exists.

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-KB-12 | S | After a source is applied, the system proposes links from its page to related pages of the same user, with a short reason (160 characters at most), applied at confidence 0.8 or more and shown on both pages. | Unit: `applyOps` refuses a self-link, an unknown page, an empty or long reason; the pair is stored once in a fixed order. pgTAP: cross-user link refused, pair unique. Eval: 0 false links on the gold pairs (3 runs). e2e: the Cicero page shows the Social War link and the reverse. **Partly built and tested 2026-10-20 (D66, not applied):** tests/unit/domain/kb.test.ts, supabase/tests/m3f.test.sql. The stage is also tested (tests/unit/domain/page-links.test.ts, tests/integration/links.test.ts); **Eval built and run 2026-10-21 (D67):** `pnpm eval:link`, 15 cases (6 pairs that must link, 9 same-field traps), 3 runs on `gemini-3.8-flash`: 0 false links, 18 of 21 expected links found (the misses were all the Social War to Caracalla pair, a prudent miss). Measured cost about $0.0017 a call. The live e2e part (the Cicero page shows the Social War link) waits for `LINK_MODE` to be "live". |
| R-KB-13 | S | The user can remove a link; a removed pair is never proposed again. | Unit and pgTAP: a removed pair is not brought back by a later batch (**tested 2026-10-20**). e2e: the remove button on a page sets the pair to `removed`, hides it on both pages and deletes nothing (**tested 2026-10-21**, tests/e2e/pages.spec.ts). Integration: `proposeLinks` does not ask about pages already linked, active or removed (**tested 2026-10-20**); the full run "remove, then a new source" is not a single test. |
| R-KB-14 | S | A page shows 0 to 3 open questions (200 characters at most) from extraction; a later source can mark one resolved; the user can resolve or remove one. | Unit and pgTAP: cap of 3, length cap, resolve frees a slot, resolve by a later capture (**tested 2026-10-20**). **Extraction built and tested 2026-10-21 (D67):** prompt `claims/v4` adds `open_questions`; tests/integration/questions.test.ts (stored with page and capture, no question mark dropped, cap of 3 and repeats dropped without failing the source, a short enriched note raises none). `pnpm eval:questions` on the 9 long fixtures: 1 source raised a question, 0 mechanical defects; the question must be read by Hugues (no gold list). **Resolution by a later source is shadow only:** `revise/v2` reports answered questions, the shadow log records them (`question_resolved` in `would_do`), nothing is resolved until the apply phase; `pnpm eval:revise` 19 cases x 3 runs: 0 false findings, 0 false resolves, 0 missed. **Display built and tested 2026-10-20:** the "Questions ouvertes" block shows open questions only (tests/e2e/pages.spec.ts). **User actions tested 2026-10-21:** "marquer résolue" and "retirer" set the status, keep the row, and the question leaves the block (tests/e2e/pages.spec.ts). |
| R-KB-15 | S | A page that reaches the claim limit gets a split proposal in the tray; accepting it partitions the claims into the proposed pages, links them, keeps every card and its history. | Not built. See the design, section 7. |
| R-KB-16 | S | Linked pages are browsable from a page: a "Fiches liées" block lists the active links with their reason, on both pages of a pair. | e2e: a linked title reaches its page and the reverse link shows; a removed link and a page without links show nothing. **Built and tested 2026-10-20 (D66, not deployed):** tests/e2e/pages.spec.ts. |
| R-TRAY-08 | S | The tray shows split proposals with accept and refuse. | Not built. |

## 13. Privacy, security, compliance — `R-SEC`

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-SEC-01 | S | Tenant isolation is enforced in the database (row-level security on every user table). The background-job role always scopes by user id. | A cross-tenant test suite tries every endpoint and table and fails on any leak. |
| R-SEC-02 | S | All endpoints and server actions check auth. Scheduled and internal endpoints reject requests without a valid secret, **including when the secret is unset**. | Tests with no secret, an empty secret and a wrong secret. |
| R-SEC-03 | S | No secrets in the repo or the docs. A pre-commit secret scanner runs, and secrets live only in the platform's env store. | The scanner runs in CI. |
| R-SEC-04 | B | AI providers used with other people's content must not train on it (paid tier or equivalent terms). This is verified and recorded per provider in decisions.md. Gemini (checked 2026-10-14): unpaid-tier content may be used to improve Google products; paid-tier content is not; in the EEA, Switzerland and the UK the paid terms apply to all services (to confirm for Hugues's account). | — |
| R-SEC-05 | B | Privacy notice (FR/EN) listing the processors: AI provider, database host, email provider. | — |
| R-SEC-06 | B | Export: the user downloads pages (Markdown), sources and cards (CSV). Delete: the account and all its data, including blobs, are removed within 30 days. | A delete test leaves no rows or blobs for the user. |
| R-SEC-07 | S | Fetching user-supplied URLs blocks private and internal IP ranges (SSRF), with timeouts and size caps. | Test with a localhost URL is refused. |
| R-SEC-08 | S | Outbound email headers are built by a library, never by string concatenation. Addresses are validated. | A CRLF-injection test fails safely. |

## 14. AI usage, cost and quality — `R-AI`, `R-EVAL`, `R-OPS`

**Model routing** (configuration, decided per stage from the eval; candidates come from the owner's private research notes `[[llm-model-selection-guide]]`):

| Stage | Needs | Notes |
|---|---|---|
| Clean / extract / detect language | Cheap, fast | Highest volume |
| Image and scan reading | Vision | |
| Topic matching (choose pages) | Judgement over summaries | Embeddings shortlist first |
| Knowledge-base update operations | Faithfulness, structured output | Hallucination risk: prefer a mid tier |
| Card proposal | Judgement of importance, quality rules | Decides product quality |
| Enrichment / Deepen | Knowledge and/or web search | Origin badges |
| Answer grading [B] | Cheap, low latency, multilingual | |
| Embeddings | Multilingual | Model and dimension pinned and stored with each vector |

| ID | Phase | Requirement | AC |
|---|---|---|---|
| R-AI-01 | S | Non-urgent stages use batch or flex pricing where the provider offers it. Stable prompt prefixes are cached. | Cost log shows the discount applied. |
| R-AI-02 | S | Prompts are versioned files. Every AI output records the prompt version. | — |
| R-OPS-01 | S | Cost is tracked per user per day. Per-user soft limit (Hugues alerted) and hard limit (captures queued, receipt says "paused"). Limits are configurable. | Test: crossing the hard limit pauses processing. |
| R-OPS-02 | S | Owner view (Hugues only), aggregates only (D63): captures by status and failure code, job states, AI cost per day and per stage against the global budget, mails sent against the Resend limits, activity and waitlist counts. No address, subject, error text or per-user row. Built as the terminal script `pnpm ops` (`scripts/ops.ts`); a web page is deferred. Detailed in R-ADMIN-01..07. | See R-ADMIN-01..07. |
| R-ADMIN-01 | S | `pnpm ops` shows captures by status, failure reason code, route and day, and jobs by stage and state with stuck (queued more than 10 minutes late), lease-expired, retrying and failed counts; a job deferred by the cost cap is not stuck. | Unit (`src/server/ops-report.test.ts`): fixture rows give exact counts; child sources and rows outside `--days` excluded. |
| R-ADMIN-02 | S | AI cost: month to date against the 50 USD global budget with a percentage, per day and per stage, unpriced calls flagged, and the number of users at 50, 80 and 100 % of their day and month caps (counts, not who). | Unit: sums, percentage, stage and day split, null cost counts as 0 and is flagged, cap counts. |
| R-ADMIN-03 | S | Mails: `email_out` sent per day and month against the Resend Free limits (100 a day, 3,000 a month), labelled as a lower bound because auth mails and waitlist confirmations are not in `email_out`. | Unit: counts, percentages, `lowerBound` and the note, limits are constants. |
| R-ADMIN-04 | S | Activity: reviews and distinct reviewers per day, new profiles, last sign-in in buckets, onboarding funnel (capture, active card, review). | Unit with fixtures. |
| R-ADMIN-05 | S | Waitlist: total, language split and new per day, counts only. | Unit with fixtures. |
| R-ADMIN-06 | S | Errors of the last 24 hours as `area:code` counts (capture reason, failed job stage, AI status, failed mail kind), plus invite usage, card keep rate and review ratings. | Unit with fixtures. |
| R-ADMIN-07 | S | The report is aggregates only: no email address, subject, error text, waitlist address or user id appears in it, even if the input rows carry such fields; the script is read-only, has no migration and prints only. | Unit: privacy test serialises the report from rows tainted with addresses, subjects and error text and finds none; empty database and `--days` window. |
| R-OPS-03 | S | The product name, sender, capture domain and app URL are configuration (D49). One file (`src/config/brand.ts`) plus env (`MAIL_FROM`, `RESEND_RECEIVING_DOMAIN`, `APP_URL`) changes them, and a test fails if an old name remains. | Test (`tests/unit/brand.test.ts`): no old name in `src`, `app`, `messages`, auth templates and subjects; `config.toml` and the template carry the current name; messages use `{brand}`; `MAIL_FROM` with a line break, not an address, or missing in production is refused. |
| R-EVAL-01 | S | An **eval set of 20–50 real sources** chosen by Hugues: FR and EN; article, PDF, image, sparse note, newsletter, plus a cluster of 3 sources on one subject. Each has expectations: must-have claims, forbidden cards, expected page clustering. | The eval runs from one command and gives a report. |
| R-EVAL-02 | S | Metrics: claim faithfulness (claim supported by its cited excerpt; LLM-judged with human spot checks), card rule violations, clustering correctness, cost per source, latency. | — |
| R-EVAL-03 | S | Any prompt or model change must not regress the eval beyond set tolerances before it is merged. | CI runs the eval subset. |

## 15. Data model (entities, no code)

- **Users and settings:** `user` (language, timezone, budget, study days, max new, retention, cost limits), `sender_address` (verified flag), `capture_address`.
- **Inbound:** `capture` (raw, provider message id, hash, status), `job` (stage, status, attempts, error).
- **Knowledge:**
  - `source` (immutable, kind, language, hash, blob ref, extractor version);
  - `page` and `page_version`;
  - `claim` and `claim_version` (origin, status), `citation` (claim → source + locator), `contradiction`;
  - `page_link`, `open_question`.
- **Learning:**
  - `card` and `card_version` (anchor claim, type, status);
  - `fsrs_state` (per card, FSRS version);
  - `review_log` (append-only), `fsrs_params` (per user, versioned);
  - `tray_item` (proposed card or update proposal or flag).
- **Ops:** `ai_call` (stage, model, prompt version, tokens, cost, latency), `email_out`, `event_log` (append-only record of what each capture changed: the second brain's "source-log").
- **Embeddings:** stored with the model id and dimension. pgvector's HNSW index on `vector` is limited to 2,000 dimensions, so request a reduced output dimension (768 or 1536) from `gemini-embedding-2` (native ≈3,072), or store as `halfvec`.

## 16. Out of scope for V2.0

- Language-learning mode (D16).
- Channels other than email (Telegram, share sheet, WhatsApp, browser extension).
- Native apps.
- Social and shared decks.
- Payments.
- Anki import.
- Offline review.
- Q&A chat over the knowledge base (R-DEEP-04, later).
- Self-hosted models (revisit if cost or privacy requires it).

## 17. Verified platform facts (2026-10-14) and remaining checks

| Topic | Finding | Consequence |
|---|---|---|
| Inbound email, no domain | Resend Receiving gives `<id>.resend.app`, any local part, webhook `email.received`, free 3,000 emails/month (inbound included). Postmark's default address is paid only. CloudMailin is a free alternative. | R-CAP-01 [S] uses Resend. |
| Outbound email, no domain | Resend's test domain sends only to the account owner. | [S] = Hugues only; a domain is a [B] gate. |
| Vercel Hobby | Functions max 300 s; cron **daily only** (hourly fails to deploy); non-commercial use only. | Hourly reminders and the job backstop run from Supabase pg_cron (D17). |
| Supabase Free | 500 MB DB, 1 GB storage, pauses after 1 week of inactivity, Edge Functions 150 s, pg_cron and Queues available. | Keep-alive job; originals in Storage. |
| ts-fsrs | 5.4.2, FSRS-6, Node ≥ 20. Optimizer `@open-spaced-repetition/binding` 0.5.0. | R-SCH-01 pins 5.4.2. |
| Gemini | YouTube URL input in preview (public videos only); Batch −50%; Search grounding (Gemini 3+): 5,000 free requests/month, then paid. | R-CAP-07 [B], R-AI-01, R-PIPE-05 [B]. |

Still to check during M0:
1. pg_net availability for pg_cron → HTTP calls on the Free plan.
2. What the Resend `email.received` webhook carries (body and attachments inline, or fetched by id), and whether Resend retries failed webhooks.
3. The Supabase auth email template with the 6-digit `{{ .Token }}` code.
4. The FSRS backlog ordering rule and ts-fsrs's reschedule and simulation helpers (R-SCH-04, R-SCH-05).

## 18. Defaults

Confirmed by Hugues: cards per source 4–5 typical, max 8; reminder 18:00; all 7 study days; 10 min budget; 5 new cards max per day.

Still proposed, adjustable after dogfooding: 25 MB attachment limit, 30-day tray collapse, 50% backlog tolerance, box boundaries, 21-day "mature" threshold, 10 s default review time.
