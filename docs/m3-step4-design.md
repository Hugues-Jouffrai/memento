# M3 step 4 design (draft): links between fiches, open questions, split proposals

Status: **draft for Hugues**, not decided. Nothing here is built. No requirement is marked done. When approved, it becomes a decision (next free D number) and new rows in `02-spec.md`.

Inputs: `04-m3-plan.md` step 4, `02-spec.md` R-KB-03 / R-KB-07 / R-KB-08 / R-TRAY-03 / §15, decisions D41 to D44, `HANDOVER.md` M3 section.

## 1. Why now

- D43 already promises it: "a manual with one chapter on algorithm X gets its own page ... linked to the page about X (links: step 4)".
- Real case on production: the Social War got its own page, "related to the Cicero page but a different subject" (HANDOVER, D41 verification). Today nothing connects them. Caracalla (Roman emperor) is the third example Hugues named.
- R-KB-03 lists `link_pages` and `add_open_question`; D42 says they "come with steps 3 and 4". R-KB-07 requires links, open questions and a split proposal above the hard size limit (60 claims, D42); today a full page just makes the next source start a new page.

## 2. What the user sees

All strings in `messages/` (FR default, EN available). Study look (cahier / bristol), no new nav entry.

1. **"Fiches liées" block on a topic page**, below the claims: up to 8 linked pages [assumption, to keep the block short], each with title and a one-line reason ("Cicéron a plaidé pendant la guerre sociale"). A link is shown on both pages (undirected). Each link has a small "retirer" action (soft delete, never re-proposed for the same pair).
2. **Browse through linked pages** (R-KB-08 already requires it): the block is the browsing path; no graph view in step 4.
3. **"Questions ouvertes" block** on the page: 0 to 3 short questions the sources raise but do not answer (e.g. "Pourquoi Caracalla a-t-il étendu la citoyenneté en 212 ?"). Actions: "marquer résolue" and "retirer". Later (Deepen, R-DEEP-02, phase B) a question can become a Deepen request; not in step 4.
4. **Split proposal** in the tray (À valider), as a third tray item kind next to proposed cards: "La fiche *Rome antique* est pleine (60 faits). Proposition : la diviser en *République romaine* (34 faits) et *Empire romain* (26 faits)." Actions: accept / refuse. Accepting moves claims, keeps every card and its history (cards are anchored to claims, not pages), creates links between the parts.
5. **Receipt / Mails reçus line** (R-TRAY-07): "2 liens ajoutés" when a source created links. No extra mail (D59).
6. After Again in a review (R-REV-04) the topic-page link already exists; linked pages are one click further. The "button after answering a card" idea stays separate.

## 3. Data model (entities, no SQL)

Follows §15 of the spec (`page_link`, `open_question`) and the deferred `tray_item` (D29, also needed by the step 3 apply phase).

- **page_link**: user, page A, page B (stored ordered A < B so a pair is unique), reason text (≤ 160 chars [assumption]), origin (`model` | `user`), status (`active` | `removed`), created by capture (nullable), prompt version, created at. A removed pair is never re-proposed.
- **open_question**: user, page, text (≤ 200 chars [assumption]), origin capture, status (`open` | `resolved` | `removed`), resolved-by capture (nullable), created at.
- **tray_item** (shared with step 3): user, kind (`card_update` | `contradiction` | `split_proposal`), status (`pending` | `accepted` | `refused`), payload (for a split: source page, proposed titles, claim id lists per part, reason), created at. Split payload refers to claim ids only; it never carries rewritten claim text.
- **Operations** added to `applyOps` (D42): `link_pages(page_a, page_b, reason)`, `add_open_question(page, text)`, `resolve_open_question(id, capture)`, `split_page(page, parts[{title, summary, claim_ids}])`. `split_page` is applied only from an accepted tray item, never straight from a pipeline batch.
- **Invariants** (validator): no self-link; both pages belong to the same user; at most N new links per batch (proposed 3); at most 3 open questions per page; `split_page` must partition the page's claims exactly (every claim in exactly one part, none invented) and each part ≤ 60 claims; no operation touches a card (the D42 property test is extended).
- Every operation writes a page version with its cause and one `event_log` row (R-KB-04), so a split or a link can be undone by restore.

## 4. How it is produced

All calls go through `src/ai/gateway.ts`, logged with cost; model and prompt names live in `src/ai/config.ts`.

### 4a. Links: new stage `link`, after `apply_ops`, one call per source
- Candidates: reuse the D41 shortlist (5 closest pages by cosine, `match_pages`), minus the page the source landed on. No new embedding call.
- One call `link/v1` on `gemini-3.8-flash` (the model D41 and D44 use): input = the landed page's title and summary bullets + each candidate's title and summary bullets. Output: reasoning first, then a list of `{candidate number, relation reason, confidence}`. Apply links at confidence ≥ 0.8 [assumption: same bar as `MERGE_CONFIDENCE`, D41; to be tuned by the eval].
- Prompt rule (from D41/D43): link when one subject is a part, cause, actor, place or context of the other (Cicero ↔ Social War; Anki manual ↔ FSRS); same broad field alone is not a link (Incas ↔ Teotihuacan: no).
- Runs only when the user has at least one other page. Failure of this stage never fails the capture (log and skip).
- **Cost:** no measurement yet. Estimate from comparable measured calls: the `match` call plus embedding cost about $0.002 per source (D41) and `revise` $0.002 to $0.004 (D44), on similar inputs (page summaries, short JSON out). **Assumption: about $0.002 per source**, to be measured in the eval before shipping.
- Backfill: a one-off script (like `scripts/backfill-page-embeddings.ts`) runs `link` once per existing page. Cost ≈ pages × $0.002 [assumption].

### 4b. Open questions: folded into the extract call
- Add an optional `open_questions` field (0 to 3) to the extraction output (new prompt version), turned into `add_open_question` operations. No extra call; extra output tokens only (assumption: well under $0.001 per source).
- When a later source joins the page, the `revise` call (D44) also receives the open questions and may return `resolves: question id` (prompt `revise/v2`), giving `resolve_open_question`. Same call, no extra cost beyond tokens.

### 4c. Split proposals: new stage `split`, triggered, rare
- Trigger: a source would push a page past 60 claims (today it starts a page of its own, D42). Instead: the source still goes to its own page as today (safe), and a `split` call runs once for the full page, unless a pending split proposal for that page exists.
- One call `split/v1` on `gemini-3.8-flash`: input = page title and the 60 claims with ids; output = 2 to 3 parts with title, summary bullets and claim ids. The validator (exact partition, sizes) refuses anything else; on refusal, no proposal and a log row.
- **Cost:** a 60-claim page was measured at $0.004 for `revise` (D44); assume about $0.005 per split call [assumption], and it runs at most once per full page.

## 5. Evaluation (eval track, R-EVAL-01..03)

- **`pnpm eval:link`** (new): reuse the 13-source match sequence (D41) plus 4 to 6 new fixtures: Cicero, the Social War, Caracalla, a Roman-citizenship source (connects Social War and Caracalla), plus the existing Anki manual and FSRS pages. Gold = a hand-labelled list of pairs that must be linked and pairs that must not (Incas ↔ Teotihuacan, Cicero ↔ Friedman, FSRS ↔ Incas). Metrics: **false links (gate: 0 on 3 runs, same spirit as D44)**, missed links (reported, target ≤ 1 per run [assumption]), cost per source.
- **Open questions**: LLM-judged plus Hugues spot check on 10 sources: a question must be on the page's subject and not already answered by a claim of the page. Gate: no answered question on the spot check.
- **`pnpm eval:split`**: 3 synthetic full pages (Rome 60 claims mixing Republic and Empire; a person page; a page with no natural split). Gate: validator passes on all; the "no natural split" page may return "no split". Human judgment of part titles.
- Run on prompt or model change (R-EVAL-03). Shadow option: as in step 3, log links for a few days before showing them (see open question 2).

## 6. Privacy and safety

- Links, questions and splits only ever involve **one user's pages**: candidates come from `match_pages` (user-scoped), and the validator plus `apply_ops` re-check ownership; RLS on the new tables (R-SEC-01), included in the cross-tenant test suite.
- Source text is untrusted: the `link` call sees only titles and summaries, the model can only pick candidate numbers from the given list (an out-of-range number is refused), and reasons/questions are length-capped and rendered as escaped text.
- No new data leaves the system beyond what extraction already sends to Gemini (page titles and summaries of the same user).
- Split never deletes: claims move, cards stay anchored, history kept, restore possible (R-KB-04). A split never runs without the user accepting the tray item.
- Account export (R-ACC) includes links and open questions; account deletion cascades.

## 7. Proposed requirement IDs (not added to the spec yet)

| Proposed ID | Phase | Requirement | Acceptance test |
|---|---|---|---|
| R-KB-12 | S | After a source is applied, the system proposes links from its page to related pages of the same user, with a short reason; applied at the confidence bar, shown on both pages. | Unit: `applyOps` refuses self-link, cross-user, duplicate pair, out-of-range candidate. Eval: 0 false links on the gold pairs (3 runs). e2e: Cicero page shows the Social War link and the reverse. |
| R-KB-13 | S | The user can remove a link; a removed pair is never proposed again. | Integration: remove, re-run `link` on a new source, the pair stays removed. |
| R-KB-14 | S | Pages show 0 to 3 open questions from extraction; a later source can mark one resolved; the user can resolve or remove one. | Unit: cap of 3, length cap. Integration: fixture where source 2 answers source 1's question gives `resolved`. |
| R-KB-15 | S | A page that reaches the claim limit gets a split proposal in the tray; accepting it partitions the claims into the proposed pages, links them, keeps every card and its review history. | Unit: partition validator. Property test (extends D42's): split never changes a card or its FSRS state. e2e: accept moves claims; refuse leaves the page as is. |
| R-TRAY-08 | S | The tray shows split proposals with accept / refuse (kind of `tray_item`). | e2e: proposal visible, accept and refuse work without JavaScript. |
| R-KB-16 | S | Linked pages are browsable from a page (completes R-KB-08 "through linked pages"). | e2e: click a linked page title reaches it. |

## 8. Build order (small steps, each with tests, each deployable alone)

1. Migration: `page_link`, `open_question` (with RLS) and `tray_item` if step 3's apply phase has not added it yet; cross-tenant tests. Migration first, then deploy (D42 ship order).
2. `applyOps`: `link_pages`, `add_open_question`, `resolve_open_question` + validators + extended property test; `apply_ops` SQL accepts them.
3. Page UI: "Fiches liées" and "Questions ouvertes" blocks (read-only), FR/EN strings, R-UI checks at 375 px.
4. `link/v1` prompt + `link` stage + `pnpm eval:link` fixtures; measure cost; gate on 0 false links. Ship (optionally in shadow first).
5. Remove-link action; backfill script for existing pages (read the cost first, ask Hugues before running on production).
6. Open questions in extraction (new extract prompt version), then `revise/v2` resolution, with the eval rerun (extract eval must not regress, R-EVAL-03).
7. `split/v1` + validator + `pnpm eval:split`; tray item kind and accept/refuse; `split_page` applied in one transaction.
8. Docs: decision row, spec rows marked tested only where tests exist, HANDOVER.

## 9. Open questions for Hugues (with recommendation)

1. **Links shown at once, or a shadow period first?** Recommend: a short shadow (3 to 5 days, log only), like step 3; a wrong link is visible on two pages.
2. **Should the user also add links by hand?** Recommend: not in step 4 (phase B, alongside R-KB-09 manual edits); removal only now.
3. **Open questions: extract them at all in phase S?** Recommend: yes, but capped at 3 and only when the source itself raises them; no web lookup to answer them (that is Deepen, phase B).
4. **Split: proposal in the tray, or automatic?** Recommend: tray proposal, never automatic (a split moves many claims at once).
5. **Confidence bar for links:** recommend starting at 0.8 (same as merges, D41) and adjusting only from the eval.
6. **Backfill links for existing pages on production:** recommend yes, once, after the eval passes; cost estimated beforehand and shown to you.
7. **Order versus the step 3 apply phase (both need `tray_item`):** recommend building links and open questions (steps 1 to 6 above) first, since they need no tray; do splits after the apply phase has created `tray_item`.
