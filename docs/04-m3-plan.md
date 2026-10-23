# M3 plan: real knowledge base

Approved by Hugues on 2026-10-14 (multi-source folded into step 0). Parent plan: `03-plan.md` (milestone M3). Requirements: `02-spec.md` R-KB-02 to R-KB-07. Decisions go to `decisions.md` (D39 onwards).

Today's schema is one page per source and one source per capture. M3 turns it into topic pages fed by several sources.

## Steps (each deployed and verified on its own; each gated by tests and, where it touches AI, by the eval)

### Step 0: several sources per mail, schema prep
- **0a (built, not yet on production):** a mail with several links or files becomes a group of captures (D39): the first item is the mail's own capture, each further one a child capture (`parent_id`, `position`) with the whole single-source pipeline, one combined receipt when the last member ends. Cap of 4 sources per mail (`MAX_ITEMS_PER_MAIL`), the rest listed as ignored. The one-source-per-capture constraint stays: it is not in the way, and this avoids rewriting every stage.
- **0b (built, not yet on production):** `ai.embed()`, pgvector and `page.embedding` / `embedding_model`; `gemini-embedding-2` at 768 dimensions, $0.20 per 1M tokens, measured (D40).
- *Exit:* a mail with two links and a mail with a PDF plus a photo each give the right sources and one receipt (tested); existing single-source behaviour and all current tests unchanged.

### Step 1: topic matching (R-KB-02) (built locally, not on production yet: D41)
- Embed the new source's summary; shortlist the 5 closest pages (cosine); one model call decides "update page X" or "create a new page" with a confidence score.
- Below the threshold: create a new page and suggest a link (a duplicate is cheaper than a false merge).
- Eval: sequence fixtures. The three FSRS sources end in one page; Cicero, Incas and Teotihuacan stay separate pages. Metric: clustering correctness.

### Step 2: structured operations (R-KB-03, R-KB-04, R-KB-05) (built locally, not on production yet: D42)
- The model returns operations (`add_claim`, `create_page`, `link_pages`), never rewritten pages. Whole-page rewrites are rejected by schema validation.
- `applyOps` is pure, validated and transactional (page version with its cause, plus an event log). Every source claim's excerpt must match the source text.
- Property test: random operation sequences never change an active card.

### Step 3: revisions and contradictions (R-KB-06)
- `revise_claim` and `flag_contradiction` run in **shadow mode** (logged, not applied) for about a week of real use, then are applied with claim versions.
- A revision that touches an active card becomes a "card update proposed" item in the tray (adds the `tray_item` table deferred by D29).

### Step 4 (later, v3): links between pages, open questions, split proposals (R-KB-07).

## Ideas attached to M3
- After answering a card in a review, one button opens the relevant page and its source (Hugues, 2026-10-14). Cheap once claims link to pages; give it an `R-` ID in the spec when scheduled (after step 2).

## Open points
- The shadow week in step 3 needs about a week of Hugues's real captures; it can run alongside M4.
- Embedding price and dimensions to measure in step 0.
