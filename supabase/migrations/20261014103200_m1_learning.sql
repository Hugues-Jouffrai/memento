-- M1 learning: cards, FSRS state, append-only review log. The tray is the set of cards with status 'proposed'.
create table public.card (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  claim_id uuid not null references public.claim (id) on delete cascade,
  source_id uuid not null references public.source (id) on delete cascade,
  question text not null,
  answer text not null,
  version integer not null default 1,
  status text not null default 'proposed'
    check (status in ('proposed', 'active', 'suspended', 'discarded', 'retired')),
  -- 1 = most important; proposals are ranked by it (R-CARD-04).
  rank integer not null default 1 check (rank >= 1),
  created_at timestamptz not null default now(),
  kept_at timestamptz
);
create index card_user_status_idx on public.card (user_id, status);

-- Scheduling state of a kept card (ts-fsrs Card fields). fsrs_version is pinned per row (R-SCH-01).
create table public.fsrs_state (
  card_id uuid primary key references public.card (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  fsrs_version text not null,
  due timestamptz not null,
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  learning_steps integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  -- ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning.
  state smallint not null default 0 check (state between 0 and 3),
  last_review timestamptz
);
create index fsrs_state_due_idx on public.fsrs_state (user_id, due);

-- R-SCH-02: append-only. State before/after are stored whole so the log can be replayed or audited.
create table public.review_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.card (id) on delete cascade,
  card_version integer not null,
  rating smallint not null check (rating between 1 and 4),
  reviewed_at timestamptz not null default now(),
  elapsed_days integer not null default 0,
  state_before jsonb not null,
  state_after jsonb not null,
  duration_ms integer check (duration_ms >= 0),
  fsrs_version text not null
);
create index review_log_card_idx on public.review_log (card_id, reviewed_at);
create trigger review_log_no_update before update on public.review_log
  for each row execute function public.forbid_update();

alter table public.card enable row level security;
alter table public.fsrs_state enable row level security;
alter table public.review_log enable row level security;

create policy card_select on public.card for select to authenticated using (user_id = (select auth.uid()));
create policy card_update on public.card for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy fsrs_state_select on public.fsrs_state for select to authenticated using (user_id = (select auth.uid()));
create policy review_log_select on public.review_log for select to authenticated using (user_id = (select auth.uid()));

-- The signed-in user may only change a card's status (keep / discard / suspend); content edits come in M3.
revoke update on public.card from authenticated;
grant update (status) on public.card to authenticated;
