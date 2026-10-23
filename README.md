# Memento

> Email a note, remember it for good.

Ce projet est né d'une frustration. Celle d'une curiosité qui ne se satisfait pas de découvrir les réponses à ses questions mais qui veut vraiment comprendre et retenir.

*This project was born out of frustration: that of a curiosity that is not satisfied with finding the answers to its questions, but wants to truly understand and remember.*

Nous vivons dans un monde d'abondance d'information et de connaissances. Cependant la quantité d'information disponible, lue ou vue, même de qualité, ne se transforme pas automatiquement en savoir. Nous pouvons apprendre des quantités impressionnantes d'informations, lire des livres entiers sur des sujets précis, et pourtant n'en retenir qu'une fraction.

*We live in a world of abundant information and knowledge. Yet the amount of information available, read or watched, even of good quality, does not automatically turn into knowledge. We can take in impressive quantities of information, read whole books on specific subjects, and still retain only a fraction of it.*

En effet sans méthode, le cerveau oublie.

*Indeed, without a method, the brain forgets.*

Mais quelle méthode ?

*But which method?*

Mes recherches sur l'état des connaissances en sciences du savoir m'ont amené à redécouvrir ce qu'étudiant je pratiquais déjà : l'interrogation, la répétition et la régularité dans l'apprentissage.

*My research into the state of knowledge in the science of learning led me to rediscover what I already practised as a student: questioning, repetition and regularity in learning.*

Il s'agit avec Memento d'astreindre mon cerveau à la discipline scolaire qui fonctionne si bien pour remplir notre mémoire de connaissances fiables et d'utiliser la technologie pour accélérer le travail fastidieux de l'élève assisté de son professeur, le fichage et l'interrogation.

*With Memento, the aim is to hold my brain to the schoolroom discipline that works so well for filling our memory with reliable knowledge, and to use technology to speed up the tedious work of the pupil helped by their teacher: making index cards and being quizzed.*

Mon ambition est de créer un outil qui permette de continuer à entrainer ma mémoire, et peut être celle des autres, au cours de ma vie pour augmenter mes connaissances sur les sujets de mon choix bien après mes années étudiantes.

*My ambition is to build a tool that lets me keep training my memory, and perhaps that of others, throughout my life, so as to grow my knowledge of the subjects I choose well after my student years.*

*Hugues Jouffrai*

---

## What it does

1. **Capture by email.** A note, a link, a PDF (scanned ones too) or a photo, sent to a dedicated address. Nothing to install.
2. **Sourced topic pages.** The content is split into individual claims, each tied to the exact excerpt it comes from. A claim the model added from its own knowledge, rather than taking it from the source, is labelled as unverified. New sources join the page of an existing topic when they belong to it, and related pages are linked to each other.
3. **A tray of proposed cards.** Question/answer cards are proposed, never imposed: you keep them or delete them.
4. **Spaced review.** Scheduling is computed by the FSRS algorithm, within a daily time budget that you set.
5. **Daily reminder.** One email at 18:00, only when there is something to review, with a link that opens the session directly.

The interface is available in French and English, comes in four visual styles, and is designed phone-first. The product runs as a closed beta at [mailtomemento.com](https://mailtomemento.com).

## Engineering choices

- **Rebuilt from scratch** after a critical analysis of a first version's failures. Numbered requirements (`R-AREA-NN`, `docs/02-spec.md`), a milestone plan (`docs/03-plan.md`), and a dated decision log (`docs/decisions.md`, 70 decisions).
- **Nothing is done without a test.** Each test carries the ID of the requirement it covers.
- **All AI calls go through a single gateway** (`src/ai/gateway.ts`): every call is logged with its cost, model names live in configuration, outputs are validated against a schema, transient errors are retried, and a per-user cost cap applies.
- **Prompts are evaluated before they ship** (`eval/`): fixture sets and metrics such as fact coverage, absence of false links, absence of false contradictions. New AI behaviours first run in *shadow mode*: they are logged but change nothing, and are judged on real mail before going live.
- **Security:** per-user isolation enforced in the database (Row Level Security), SSRF-safe link fetching, sender verified through DKIM, signed webhooks, signed and time-limited review links, one-click unsubscribe.
- **Scheduling verified by simulation:** over 180 days and several user profiles, the time spent never exceeds the chosen budget.
- **Documentation:** the design documents in `docs/` explain the reasoning behind the main features.

## Stack

| Area | Choice |
|---|---|
| Application | Next.js 16 (App Router), React 19, strict TypeScript |
| Data | Supabase: Postgres, pgvector, RLS, pg_cron, Storage |
| Spaced repetition | `ts-fsrs` (FSRS) |
| AI | Gemini, only through the internal gateway; embeddings to match topics |
| Email | Resend (sending and receiving), a job queue in the database |
| Extraction | Readability (web pages), `unpdf` (PDF), a vision model (scans and images) |
| i18n | `next-intl` |
| Tests | Vitest (unit and integration), pgTAP (database), Playwright (end to end) |
| Hosting | Vercel |

## Repository layout

```
app/          pages and server actions (home, tray, review, topics, settings...)
src/ai/       AI gateway, versioned prompts, schemas, cost
src/domain/   pure logic: scheduling, cards, knowledge base, mail
src/server/   job queue, pipeline stages, reminders
supabase/     SQL migrations, pgTAP tests
eval/         prompt evaluation sets
tests/        unit, integration, e2e
docs/         specification, plan, decisions, design documents
```

## How it was built

I set the product direction, wrote the requirements and made the decisions. Much of the code was written with AI coding agents (Claude Code) working from those specifications, under the discipline above: every requirement needs a passing test, and every AI behaviour needs an evaluation, before it counts as done.

## Running it locally

Requires Node, pnpm and Docker.

```bash
pnpm install
supabase start          # local database
pnpm test               # unit tests
pnpm test:integration   # integration tests (local database)
supabase test db        # pgTAP tests
pnpm test:e2e           # end-to-end tests
supabase stop
```

API keys (AI, email) are read from `.env.local`, which is never committed; `.env.example` lists the names. The tests need no real key.

## License

[MIT](LICENSE). This repository is a snapshot of a private development repository, published without its history.
