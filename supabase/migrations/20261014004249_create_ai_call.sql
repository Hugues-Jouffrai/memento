-- ai_call: one row per AI attempt, written by the gateway (R-PIPE-07).
-- Server-only table: RLS is on and no policy exists, so only the service role can read or write it.
create table public.ai_call (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  stage text not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  attempt integer not null check (attempt >= 1),
  status text not null check (status in ('ok', 'invalid_output', 'provider_error')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  -- USD; null when no price is known for the model.
  cost_usd numeric(12, 8),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  error text
);

create index ai_call_user_day_idx on public.ai_call (user_id, at);

alter table public.ai_call enable row level security;
