# LeitnerBox V2 — Implementation Plan (approved 2026-10-14)

## Context
V1 (the first version, kept in a separate private repository) is being retired. It was marked "done", but its core loop never worked: the crons never fired, merging was dead code, note editing was broken, and there were security holes.

Over this session we wrote:
- `docs/00-v1-analysis.md` (V1 analysis)
- `docs/01-critical-review.md` (critical review)
- `docs/02-spec.md` (spec v0.1, requirements R-*, phases S / B / L)
- `docs/decisions.md` (D1–D16)

The user now asks to:
1. Apply their latest answers to the spec.
2. Pick the eval set from their the owner's private research notes inputs.
3. Get a plan to implement the spec.

The aim is a working email → knowledge base → cards → FSRS → reminder loop that Hugues dogfoods alone, then a beta for friends and family.

**User decisions this round:**
- Cards proposed per source vary with the source: typically 4–5, hard max 8.
- Reminder at 18:00, every day. The default is 7 study days a week; the user can reduce it.
- Repo: this folder plus a private GitHub repo.
- AI: Gemini first, behind a provider-agnostic gateway.
- Stack: Next.js (TypeScript) on Vercel Hobby, plus Supabase.

## Step 1: Doc updates (first commit)

**In `docs/02-spec.md`:**
- R-CARD-04: card count is "set by source richness, typically 4–5, max 8".
- R-ACC-05: study days default to all 7.
- R-NOT-01: reminder default is 18:00.
- §18: remove the confirmed defaults.
- §17: replace the questions with the research results (below).
- R-CAP-01 [S]: use the Resend `<id>.resend.app` receiving domain.
- New note: [S] outbound mail goes only to Hugues (a Resend restriction without a domain).
- R-SEC-04: record the Gemini terms. The free tier uses prompts to improve Google's products; the paid tier does not; the EEA gets paid terms on all tiers (check for Hugues's account).
- Embeddings: reduced dimension (768 or 1536) or `halfvec`, because pgvector's HNSW index on `vector` is limited to 2,000 dimensions.

**In `docs/decisions.md`:**
- Amend D9: 7 days a week, 18:00.
- New entries:
  - D17: background jobs architecture.
  - D18: repo and CI.
  - D19: Gemini as the first provider.
  - D20: number of cards per source.

**New file:** `docs/03-plan.md`, containing this plan.

## Research results the plan relies on (2026-10-14)
| Topic | Finding |
|---|---|
| Vercel Hobby | 300 s function maximum; cron runs **daily only** (an hourly cron fails to deploy); non-commercial use only. |
| Supabase Free | 500 MB DB, 1 GB storage; pauses after 1 week of inactivity; Edge Functions 150 s; pg_cron and pgmq available (check pg_net). |
| Resend | Free receiving address `<id>.resend.app` (any local part, so per-user token addresses) via a `email.received` webhook; 3,000 emails/month. Without a domain it can only send to the account owner. |
| ts-fsrs | 5.4.2 (FSRS-6, Node ≥ 20). Optimizer: `@open-spaced-repetition/binding` 0.5.0 (phase L). |
| Gemini | Key works with `gemini-3.8-flash`, `gemini-3.5-flash-lite` and `gemini-embedding-2`. Batch is −50%. YouTube input is in preview. Search grounding: 5,000 free requests/month. |

## Architecture
- **Background jobs: Postgres `jobs` table plus a Vercel worker route.**
  - The inbound webhook stores the raw capture and enqueues the first job in the same transaction, then kicks `/api/worker` (Next `after()`).
  - pg_cron calls the worker through pg_net every minute as a backstop. A second pg_cron job every 15 minutes enqueues reminders.
  - Jobs are claimed with `FOR UPDATE SKIP LOCKED`, a lease, and an idempotency key `(capture_id, stage)`.
  - Backoff is `run_after = now() + 2^attempts min`; after 3 failures the capture is marked failed and a failure receipt is sent.
  - The knowledge-base update stage takes a per-user advisory lock.
  - The worker drains for ≤ 240 s. Every stage is designed to take < 60 s; long documents are split into chunk jobs.
  - Behind an `enqueue / claim / complete / fail` interface, so it can be swapped for Inngest later.
- **No new vendors** beyond Supabase, Vercel, Resend, GitHub and Gemini. A daily GitHub Action calls `/api/health` (which runs a DB query) to prevent Supabase from pausing.
- **Repo layout** (one Next.js app, TypeScript strict, Node 22, pnpm):
  - `app/`: routes (auth, review/[session], tray, pages/[id], settings, admin, api/inbound/resend, api/worker, api/health)
  - `src/domain/`: pure code with no I/O: capture parsing, kb ops plus `applyOps`, card validator plus lineage state machine, scheduling (ts-fsrs wrapper, allowance, simulator), local-day/timezone
  - `src/server/`: repositories, job runner, `stages/*`, outbound email, SSRF-safe fetcher, storage
  - `src/ai/`: `gateway.ts` (the only entry point), `providers/gemini.ts` and `providers/fake.ts`, `prompts/<stage>/vN.md`, zod schemas, routing config
  - `messages/fr.json`, `messages/en.json`
  - `supabase/migrations`, `supabase/tests` (pgTAP)
  - `eval/`
  - `tests/` (integration and e2e)
- **Enforced rules** (lint or CI):
  - `src/domain` imports no I/O.
  - Only the gateway imports the Gemini SDK.
  - No `'use server'` file exports AI helpers.
  - No hard-coded UI strings.
  - Secret checks fail closed when the secret is missing or empty.
  - gitleaks runs in pre-commit and in CI.
- **Tests:**
  - Vitest unit tests on `src/domain` (most acceptance criteria).
  - Local Supabase (CLI plus Docker): pgTAP RLS-on-every-table, and a two-JWT cross-tenant suite.
  - Pipeline integration tests using the fake AI provider.
  - Playwright end-to-end tests.
  - Tests are tagged `[R-XXX-NN]`, and a script generates `docs/status.md` from the results.
- **Migrations and CI:**
  - Migrations only via `supabase migration new`; CI fails on generated-type drift.
  - A protected GitHub Action runs `supabase db push` on main.
  - Every PR: lint, typecheck, unit tests, database tests, end-to-end tests.
  - Changes to `src/ai` or prompts also run the eval subset against a baseline.
  - Nightly: the full eval.

## Eval set (picked from the owner's private research notes; expectations drafted by Claude, reviewed by Hugues)
Copy the fixtures into `eval/fixtures/<id>/` in the **private** repo. Each fixture has an `input.*` file and an `expect.yaml` (must-have claims, forbidden cards, expected page cluster).

| Kind | Sources (path under `the owner's private research notes/problems/`) |
|---|---|
| English articles | `ai/input/article-sutton-bitter-lesson-2019.md`, `article-meta-llama-3-2-2024.md`, `article-meta-genai-infrastructure-2024.md` |
| Same-topic cluster (expect 1 page cluster) | `cognitive-science-education/input/web-osr-fsrs-repo.md`, `web-remnote-fsrs-help.md`, `web-anki-manual-fsrs.md` (+ `web-osr-fsrs-algorithm-wiki.md`) |
| PDF | `cognitive-science-education/input/Dunlosky_SciAmMind…pdf`, `Why inquiry based approaches…pdf` (15 pages) |
| French PDF | `cognitive-science-education/input/education/accès à l'enseignement supérieur france.pdf` |
| French text | `ai/input/notes-louis-podcast-ep02-seeds-2026-10-03.md`, an excerpt of `ai/research/input/podcast-permanent-underclass-pilot-2026-04/extract.md` (transcript) |
| Same subject, two languages (merge test) | `cognitive-science-education/input/obsidian-wiki-legacy/wiki/Cognitive Load Theory.md` + the Sweller PDF |
| Video transcript | `ai/input/video-fireship-gemini-2-0-2025.md` |
| List of links | `ai/input/notes-ia-links.md` |
| Fast-moving data | `ai/input/article-google-gemini-pricing-2026-10.md` |
| Long documents (long-document policy) | `ai/input/paper-lcm-team-2024.md` (209 KB), `paper-hao-2024.md` (71 KB) |
| Synthetic (written in M0) | "Je suis allé voir l'expo Warhol", "J'ai lu sur la 2e DB du général Leclerc", a forwarded newsletter `.eml`, a phone screenshot of an article |

Plus **sequence fixtures**, which test the knowledge-base update over a series of sources:
- 3 FSRS pages in a row → 1 page cluster.
- Sutton then Llama → separate pages.
- The same source twice → no new claims.
- The Leclerc note, then a Leclerc article → the AI-added claims gain citations.
- Two conflicting figures → a contradiction flag.

Excluded:
- The mp3 (audio is phase L).
- The xlsx files.
- The large AI Studio JSON exports.

## Milestones (each one deployed to production; requirement IDs are listed in `03-plan.md`)
- **M0 Foundations:**
  - git init (check `.gitignore` covers `.env.local` first), private GitHub repo, Next.js scaffold.
  - Supabase project in the EU plus a local stack, CI, gitleaks, Vercel deploy, `/api/health`.
  - Doc updates (Step 1).
  - AI gateway (Gemini and fake providers, zod validation and retry, an `ai_call` log with cost, versioned prompts).
  - Eval runner (`pnpm eval --subset smoke`) with about 8 fixtures.
  - Spikes to confirm: pg_cron/pg_net on Free; the contents of the Resend `email.received` payload; Supabase OTP code email.
  - *Exit:* CI green, production URL live, eval report produced.
- **M1 Walking skeleton:**
  - Magic link plus a 6-digit code.
  - Resend inbound with per-user token addresses, sender check, raw capture stored first, idempotency, receipts.
  - Job runner; plain-text and HTML body; user-note split.
  - KB v0: append-only, one page per source.
  - Card proposals: 4–5 typical, max 8, with the quality validator.
  - Tray.
  - ts-fsrs 5.4.2 pinned, append-only review log, replay test.
  - Review session.
  - 18:00 reminder with a 24 h signed deep link.
  - RLS, secret checks, header safety.
  - *Exit:* Hugues emails a note from his phone, gets a receipt within 5 minutes, keeps cards, gets the 18:00 mail, and reviews from it. Also passing: foreign-sender, duplicate-delivery, fault-injection, cross-tenant and 3-timezone tests. **Dogfooding starts here.**
- **M2 Capture breadth:**
  - URL fetch with snapshot, paywall receipt, SSRF guard.
  - PDFs (text layer, vision for scanned pages); images via vision.
  - Newsletter and forwarding-header stripping.
  - Language detection, exact dedup, limits.
  - Sparse-note enrichment with the `model` badge.
  - *Exit:* every capture-type fixture passes.
- **M3 Real knowledge base**, gated by the eval at each step:
  - v1: topic matching. pgvector shortlist (top 5 pages) plus one LLM decision with a confidence score. Below the threshold it creates a new page and suggests a link, since a duplicate is cheaper than a false merge.
  - v2: `revise_claim` and `flag_contradiction` run in **shadow mode** (logged, not applied) for about a week, then are applied with claim versions. Revisions affecting active cards become "card update proposed" in the tray.
  - v3: links, open questions, split proposals.
  - Safeguards:
    - `applyOps` is pure, validated and transactional (page_version plus event_log).
    - Every source claim's excerpt must fuzzy-match the source text.
    - Whole-page rewrites are rejected by schema validation.
    - Property tests: random operation sequences never change an active card.
- **M4 Budget-correct scheduling:**
  - Allowance adapts to the budget using the user's median seconds per review.
  - Budget stop.
  - Settings UI with server-side validation.
  - Re-learn view after Again; suspend and edit during review.
  - *Exit:* a 180-day simulation stays within budget.
- **M5 End-of-S hardening:**
  - Long-document policy.
  - Model routing table in the database.
  - Batch API and prompt caching.
  - Per-user cost limits (a global kill switch exists from M1).
  - Admin view.
  - Search and browse; version restore UI.
  - Backlog spreading.
  - Boxes view, dashboard.
  - English UI.
  - PWA.
  - Eval regression gate in CI.
  - *Exit:* 2–4 weeks of daily dogfooding with no silent failures.
- **M6 Beta: identity and mail:**
  - Domain, plus SPF/DKIM/DMARC on Resend send and receive.
  - Allowlist; verified extra senders.
  - Paid Gemini tier, recorded in decisions.md.
  - Privacy notice; export and delete.
  - Hand-editing claims; source deletion.
  - Unsubscribe and pause.
  - Manual checks on iOS and Android.
- **M7 Beta: features:**
  - Deepen, plus commands by email reply.
  - YouTube.
  - Web-grounded enrichment.
  - Cloze and why-cards; AI-graded typed answers.
  - Holiday pause.
  - True retention.
  - Tray collapse; auto-keep.
  - Weekly summary.

## What Hugues does by hand (Claude prepares exact steps when each is needed)
1. **M0:**
   - Install Node 22, pnpm, Docker Desktop and the Supabase CLI.
   - `gh auth login`.
   - Create accounts and projects: Supabase (EU region), Vercel (import the repo), Resend (enable Receiving, API key, webhook to `/api/inbound/resend`).
   - Paste the keys into Vercel and GitHub secrets.
   - Edit the Supabase email template to include `{{ .Token }}` (the 6-digit code).
2. **Eval:** review the drafted `expect.yaml` files (about 1 hour).
3. **Before M6:** buy a domain; switch Gemini to paid billing.
4. **Rotate the Gemini key**, since it was pasted in chat.

## Risks
| Risk | Mitigation |
|---|---|
| Supabase pauses | Keep-alive Action, plus a reconciliation job that fetches missed inbound mail via the Resend API |
| pg_net/pg_cron unavailable or the Resend payload is thin | Find out in the M0 spike; fallback is a GitHub Actions cron every 5 min |
| Cost runaway | Attempt caps, kill switch, per-user hard limit |
| Timezone bugs (as in V1) | `timestamptz` everywhere, one local-day function, multi-timezone tests |
| Bad merges | Stepwise rollout, shadow mode, versioning and restore |
| The eval set contains copyrighted material | Repo stays private |

## Verification
- **Each milestone:** CI green (unit tests, pgTAP RLS, cross-tenant suite, integration tests with the fake AI, Playwright) and `docs/status.md` regenerated from the tagged tests.
- **AI changes:** the eval subset against the baseline, with reports in `eval/reports/`.
- **M1 end-to-end on production:**
  1. Send an email from Hugues's phone to his `<token>@<id>.resend.app` address.
  2. Receipt within 5 minutes.
  3. Keep cards in the tray.
  4. 18:00 reminder.
  5. Open the deep link and review.
  6. Check that `review_log` and `fsrs_state` updated, and that `ai_call` costs are logged.
- **Negative checks on production:** a foreign sender is rejected; re-delivery creates no duplicate; calling the worker without a secret returns 401; an expired deep link sends you to login.
