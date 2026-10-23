-- M1 knowledge base v0: append-only, one page per source (plan M1). Matching across sources is M3.
create table public.source (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  capture_id uuid not null references public.capture (id) on delete cascade,
  kind text not null check (kind in ('email_body', 'user_note')),
  title text,
  url text,
  language text check (language in ('fr', 'en')),
  extracted_text text not null,
  content_hash text not null,
  extractor text not null,
  extractor_version text not null,
  created_at timestamptz not null default now()
);
create index source_user_idx on public.source (user_id, created_at desc);

-- Append-only guard shared by source, page_version and review_log.
create function public.forbid_update() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% rows are append-only', tg_table_name;
end $$;

-- R-KB-01: sources are immutable after extraction.
create trigger source_immutable before update on public.source
  for each row execute function public.forbid_update();

create table public.page (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null references public.source (id) on delete cascade,
  title text not null,
  language text check (language in ('fr', 'en')),
  created_at timestamptz not null default now()
);
create index page_user_idx on public.page (user_id, created_at desc);

-- R-KB-04: every change is a version with its cause.
create table public.page_version (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.page (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null check (version >= 1),
  summary text[] not null default '{}',
  cause_capture_id uuid references public.capture (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (page_id, version)
);
create trigger page_version_append_only before update on public.page_version
  for each row execute function public.forbid_update();

create table public.claim (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  page_id uuid not null references public.page (id) on delete cascade,
  text text not null,
  origin text not null check (origin in ('source', 'model')),
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now()
);
create index claim_page_idx on public.claim (page_id);

-- R-KB-05: a claim of origin 'source' must cite at least one source. The pipeline inserts claim and
-- citations in one transaction and validates before writing.
create table public.citation (
  claim_id uuid not null references public.claim (id) on delete cascade,
  source_id uuid not null references public.source (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  excerpt text not null,
  primary key (claim_id, source_id)
);

alter table public.source enable row level security;
alter table public.page enable row level security;
alter table public.page_version enable row level security;
alter table public.claim enable row level security;
alter table public.citation enable row level security;

create policy source_select on public.source for select to authenticated using (user_id = (select auth.uid()));
create policy page_select on public.page for select to authenticated using (user_id = (select auth.uid()));
create policy page_version_select on public.page_version for select to authenticated using (user_id = (select auth.uid()));
create policy claim_select on public.claim for select to authenticated using (user_id = (select auth.uid()));
create policy citation_select on public.citation for select to authenticated using (user_id = (select auth.uid()));
