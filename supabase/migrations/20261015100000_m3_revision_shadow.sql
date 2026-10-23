-- M3 step 3, shadow mode (R-KB-06, D44): what the revise stage found when a source joined a page that already had
-- claims. Nothing here is applied: no claim, page or card changes. Server-only (RLS on, no policy), like match_log.
-- One row per capture, so a retried job rewrites its own row. Hugues reviews the rows with scripts/show-revisions.ts.
create table public.revision_shadow (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  capture_id uuid not null unique references public.capture (id) on delete cascade,
  page_id uuid references public.page (id) on delete set null,
  prompt_version text not null,
  model text not null,
  reasoning text,
  -- Accepted findings: kind, existing claim (id and text), new claim text, corrected text, reason.
  findings jsonb not null default '[]',
  -- Findings refused by the checks (unknown claim number, revision without text, repeated pair), with the reason.
  rejected jsonb not null default '[]',
  -- The events a real run would have produced (dry run of applyOps): claim_revised, card_update_proposed, contradiction_flagged.
  would_do jsonb not null default '[]',
  error text,
  created_at timestamptz not null default now()
);
create index revision_shadow_page_idx on public.revision_shadow (page_id, created_at);
alter table public.revision_shadow enable row level security;
