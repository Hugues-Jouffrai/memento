-- M3 step 1: topic matching (R-KB-02). A new source is added to an existing topic page when the model says it is the
-- same subject (D41); otherwise it gets a page of its own.

-- Which pages a source fed. A page has several sources; page.source_id stays "the source that created the page".
create table public.source_page (
  source_id uuid not null references public.source (id) on delete cascade,
  page_id uuid not null references public.page (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (source_id, page_id)
);
create index source_page_page_idx on public.source_page (page_id);
alter table public.source_page enable row level security;
create policy source_page_select on public.source_page for select to authenticated using (user_id = (select auth.uid()));
insert into public.source_page (source_id, page_id, user_id) select source_id, id, user_id from public.page;

-- Which capture produced a claim (model-origin claims have no citation, so this is the only link back).
alter table public.claim add column capture_id uuid references public.capture (id) on delete set null;
update public.claim c set capture_id = s.capture_id from public.page p join public.source s on s.id = p.source_id where c.page_id = p.id;
create index claim_capture_idx on public.claim (capture_id);

-- Every matching decision, for tuning and audit. Server-only (RLS on, no policy), like ai_call.
create table public.match_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  capture_id uuid not null references public.capture (id) on delete cascade,
  decision text not null check (decision in ('update', 'new')),
  page_id uuid references public.page (id) on delete set null,
  confidence numeric,
  reasoning text,
  candidates jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table public.match_log enable row level security;

-- The pages closest to an embedding (cosine), for one user and one embedding model, with their latest summary.
create function public.match_pages(p_user_id uuid, p_embedding extensions.vector(768), p_model text, p_limit integer default 5)
returns table (id uuid, title text, summary text[], similarity double precision)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.title,
         coalesce((select v.summary from public.page_version v where v.page_id = p.id order by v.version desc limit 1), '{}'),
         1 - (p.embedding operator(extensions.<=>) p_embedding)
    from public.page p
   where p.user_id = p_user_id and p.embedding is not null and p.embedding_model = p_model
   order by p.embedding operator(extensions.<=>) p_embedding
   limit p_limit;
$$;

-- store_extraction can extend an existing page: payload.page_id names it. The summary in the payload is the page's
-- new summary (already merged by the caller); the claims are the new ones only.
create or replace function public.store_extraction(p_capture_id uuid, p_payload jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid;
  v_source uuid;
  v_page uuid;
  v_version integer;
  v_claim uuid;
  c jsonb;
begin
  select user_id into v_user from public.capture where id = p_capture_id for update;
  if v_user is null then raise exception 'capture % not found', p_capture_id; end if;

  select id into v_source from public.source where capture_id = p_capture_id;
  if v_source is not null then return v_source; end if;

  insert into public.source (user_id, capture_id, kind, title, url, blob_path, language, extracted_text, content_hash, extractor, extractor_version)
  values (v_user, p_capture_id, p_payload->>'kind', p_payload->>'title', p_payload->>'url', p_payload->>'blob_path',
          p_payload->>'language', p_payload->>'text', p_payload->>'hash', p_payload->>'extractor', p_payload->>'extractor_version')
  returning id into v_source;

  if nullif(p_payload->>'page_id', '') is not null then
    select id into v_page from public.page where id = (p_payload->>'page_id')::uuid and user_id = v_user for update;
    if v_page is null then raise exception 'page % not found for this user', p_payload->>'page_id'; end if;
    select coalesce(max(version), 0) + 1 into v_version from public.page_version where page_id = v_page;
  else
    insert into public.page (user_id, source_id, title, language)
    values (v_user, v_source, p_payload->>'page_title', p_payload->>'language')
    returning id into v_page;
    v_version := 1;
  end if;

  insert into public.page_version (page_id, user_id, version, summary, cause_capture_id)
  values (v_page, v_user, v_version,
          coalesce(array(select jsonb_array_elements_text(p_payload->'summary')), '{}'), p_capture_id);
  insert into public.source_page (source_id, page_id, user_id) values (v_source, v_page, v_user);

  for c in select * from jsonb_array_elements(p_payload->'claims') loop
    insert into public.claim (user_id, page_id, text, origin, capture_id, created_at)
    values (v_user, v_page, c->>'text', coalesce(c->>'origin', 'source'), p_capture_id, clock_timestamp())
    returning id into v_claim;
    if coalesce(c->>'origin', 'source') = 'source' then
      insert into public.citation (claim_id, source_id, user_id, excerpt)
      values (v_claim, v_source, v_user, c->>'excerpt');
    end if;
  end loop;
  return v_source;
end $$;

-- One extract job per user at a time: matching reads the user's pages and then writes to one of them, so two
-- concurrent extractions (two mails, or two links of one mail) could both create a page for the same subject.
create or replace function public.claim_jobs(p_limit integer, p_lease_seconds integer)
returns setof public.job language sql security invoker set search_path = '' as $$
  update public.job j
     set status = 'running', attempts = j.attempts + 1,
         lease_until = now() + make_interval(secs => p_lease_seconds), updated_at = now()
   where j.id in (
     select q.id from public.job q
      where q.run_after <= now() and q.attempts < q.max_attempts
        and (q.status = 'queued' or (q.status = 'running' and q.lease_until < now()))
        and not (q.stage = 'extract' and exists (
          select 1 from public.job r
           where r.stage = 'extract' and r.user_id = q.user_id and r.id <> q.id
             and r.status = 'running' and r.lease_until >= now()))
      order by q.run_after
      limit p_limit
      for update skip locked)
  returning j.*;
$$;

revoke all on function public.match_pages(uuid, extensions.vector, text, integer) from public, anon, authenticated;
revoke all on function public.store_extraction(uuid, jsonb), public.claim_jobs(integer, integer) from public, anon, authenticated;
