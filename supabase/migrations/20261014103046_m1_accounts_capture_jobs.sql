-- M1: accounts, capture, jobs, outbound mail log. Every table has RLS (R-SEC-01).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- profile: per-user settings (R-ACC-03..06, R-NOT-01). Server-side limits are CHECK constraints.
create table public.profile (
  user_id uuid primary key references auth.users (id) on delete cascade,
  language text not null default 'fr' check (language in ('fr', 'en')),
  timezone text not null default 'Europe/Paris',
  daily_minutes integer not null default 10 check (daily_minutes in (3, 6, 10, 15, 20)),
  -- 0 = Sunday ... 6 = Saturday; default every day (D9).
  study_days smallint[] not null default '{0,1,2,3,4,5,6}'
    check (cardinality(study_days) between 1 and 7 and study_days <@ '{0,1,2,3,4,5,6}'::smallint[]),
  max_new_cards integer not null default 5 check (max_new_cards between 0 and 20),
  desired_retention numeric(3, 2) not null default 0.90 check (desired_retention between 0.80 and 0.95),
  reminder_time time not null default '18:00',
  created_at timestamptz not null default now()
);

-- capture_address: the secret local part of the user's <token>@<id>.resend.app address (R-CAP-01).
create table public.capture_address (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 20),
  created_at timestamptz not null default now()
);

-- Every new auth user gets a profile and a capture address.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profile (user_id) values (new.id);
  insert into public.capture_address (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Back-fill users created before this migration.
insert into public.profile (user_id) select id from auth.users on conflict do nothing;
insert into public.capture_address (user_id) select id from auth.users on conflict do nothing;

-- capture: the raw inbound mail, stored before any processing (R-CAP-04).
create table public.capture (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider_message_id text not null,
  from_address text not null,
  subject text,
  -- received -> processing -> done | failed ; rejected / duplicate are terminal at once.
  status text not null default 'received'
    check (status in ('received', 'processing', 'done', 'failed', 'rejected', 'duplicate')),
  -- The webhook payload exactly as received (metadata only for Resend, D25).
  raw jsonb not null,
  body_text text,
  body_html text,
  content_hash text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- R-CAP-05: a re-delivered mail is not captured twice.
  unique (user_id, provider_message_id)
);
create index capture_user_created_idx on public.capture (user_id, created_at desc);
create index capture_user_hash_idx on public.capture (user_id, content_hash);

-- job: Postgres-backed queue (D17).
create table public.job (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  capture_id uuid references public.capture (id) on delete cascade,
  stage text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  lease_until timestamptz,
  idempotency_key text not null unique,
  payload jsonb not null default '{}',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index job_claim_idx on public.job (run_after) where status in ('queued', 'running');

-- email_out: every outbound mail (R-NOT-03). dedup_key makes "one reminder per day" a constraint.
create table public.email_out (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('receipt', 'reminder')),
  dedup_key text not null,
  to_address text not null,
  subject text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, dedup_key)
);

alter table public.profile enable row level security;
alter table public.capture_address enable row level security;
alter table public.capture enable row level security;
alter table public.job enable row level security;
alter table public.email_out enable row level security;

-- Users read their own rows. Writes go through the server, except settings.
create policy profile_select on public.profile for select to authenticated using (user_id = (select auth.uid()));
create policy profile_update on public.profile for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy capture_address_select on public.capture_address for select to authenticated using (user_id = (select auth.uid()));
create policy capture_select on public.capture for select to authenticated using (user_id = (select auth.uid()));
-- job and email_out: server-only (RLS on, no policy), like ai_call.

-- Column-level write limits: a signed-in user may change only their settings.
revoke update on public.profile from authenticated;
grant update (language, timezone, daily_minutes, study_days, max_new_cards, desired_retention, reminder_time)
  on public.profile to authenticated;
