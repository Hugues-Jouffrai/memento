-- M3 step 4 (D66, R-KB-12 to R-KB-14): links between pages and open questions. The server writes them through
-- apply_ops; a signed-in user can only read them and change the status (remove a link, resolve or remove a question).

-- One row per unordered pair of pages (page_a < page_b), so a pair is unique and a removed pair is never proposed again.
create table public.page_link (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  page_a uuid not null references public.page (id) on delete cascade,
  page_b uuid not null references public.page (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 160),
  origin text not null default 'model' check (origin in ('model', 'user')),
  status text not null default 'active' check (status in ('active', 'removed')),
  capture_id uuid references public.capture (id) on delete set null,
  prompt_version text,
  created_at timestamptz not null default now(),
  check (page_a < page_b),
  unique (page_a, page_b)
);
create index page_link_b_idx on public.page_link (page_b);
create index page_link_user_idx on public.page_link (user_id);
alter table public.page_link enable row level security;
create policy page_link_select on public.page_link for select to authenticated using (user_id = (select auth.uid()));
create policy page_link_update on public.page_link for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.page_link from authenticated;
grant update (status) on public.page_link to authenticated;

create table public.open_question (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  page_id uuid not null references public.page (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'resolved', 'removed')),
  capture_id uuid references public.capture (id) on delete set null,
  resolved_capture_id uuid references public.capture (id) on delete set null,
  created_at timestamptz not null default now()
);
create index open_question_page_idx on public.open_question (page_id, status);
alter table public.open_question enable row level security;
create policy open_question_select on public.open_question for select to authenticated using (user_id = (select auth.uid()));
create policy open_question_update on public.open_question for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.open_question from authenticated;
grant update (status) on public.open_question to authenticated;

-- The event log gets the three new kinds.
alter table public.event_log drop constraint event_log_kind_check;
alter table public.event_log add constraint event_log_kind_check
  check (kind in ('page_created', 'claim_added', 'summary_set', 'link_added', 'question_added', 'question_resolved'));

-- apply_ops, same as before plus link_pages, add_open_question and resolve_open_question.
-- link_pages {page_a, page_b, reason, prompt_version?}: "$new" names the page the batch created; both pages must belong
-- to the user; a pair that already exists (active or removed) is left alone. Links and questions do not change a page's
-- text, so they add no page version.
create or replace function public.apply_ops(p_capture_id uuid, p_source jsonb, p_ops jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid;
  v_source uuid;
  v_new uuid;
  v_page uuid;
  v_other uuid;
  v_claim uuid;
  v_summaries jsonb := '{}';
  v_touched uuid[] := '{}';
  v_version integer;
  v_summary text[];
  v_id uuid;
  o jsonb;
begin
  select user_id into v_user from public.capture where id = p_capture_id for update;
  if v_user is null then raise exception 'capture % not found', p_capture_id; end if;

  select id into v_source from public.source where capture_id = p_capture_id;
  if v_source is not null then return v_source; end if;

  insert into public.source (user_id, capture_id, kind, title, url, blob_path, language, extracted_text, content_hash, extractor, extractor_version)
  values (v_user, p_capture_id, p_source->>'kind', p_source->>'title', p_source->>'url', p_source->>'blob_path',
          p_source->>'language', p_source->>'text', p_source->>'hash', p_source->>'extractor', p_source->>'extractor_version')
  returning id into v_source;

  for o in select * from jsonb_array_elements(p_ops) loop
    if o->>'op' = 'create_page' then
      if v_new is not null then raise exception 'a batch creates at most one page'; end if;
      insert into public.page (user_id, source_id, title, language)
      values (v_user, v_source, o->>'title', o->>'language') returning id into v_new;
      v_summaries := jsonb_set(v_summaries, array[v_new::text], o->'summary');
      v_touched := v_touched || v_new;
      insert into public.event_log (user_id, capture_id, page_id, kind, detail)
      values (v_user, p_capture_id, v_new, 'page_created', jsonb_build_object('title', o->>'title'));
    elsif o->>'op' in ('add_claim', 'set_summary') then
      if o->>'page' = '$new' then
        v_page := v_new;
        if v_page is null then raise exception 'no page was created in this batch'; end if;
      else
        select id into v_page from public.page where id = (o->>'page')::uuid and user_id = v_user for update;
        if v_page is null then raise exception 'page % not found for this user', o->>'page'; end if;
      end if;
      if not (v_page = any (v_touched)) then v_touched := v_touched || v_page; end if;
      if o->>'op' = 'set_summary' then
        v_summaries := jsonb_set(v_summaries, array[v_page::text], o->'summary');
        insert into public.event_log (user_id, capture_id, page_id, kind, detail)
        values (v_user, p_capture_id, v_page, 'summary_set', jsonb_build_object('bullets', jsonb_array_length(o->'summary')));
      else
        insert into public.claim (user_id, page_id, text, origin, capture_id, created_at)
        values (v_user, v_page, o->>'text', o->>'origin', p_capture_id, clock_timestamp())
        returning id into v_claim;
        if o->>'origin' = 'source' then
          insert into public.citation (claim_id, source_id, user_id, excerpt) values (v_claim, v_source, v_user, o->>'excerpt');
        end if;
        insert into public.event_log (user_id, capture_id, page_id, kind, detail)
        values (v_user, p_capture_id, v_page, 'claim_added', jsonb_build_object('claim_id', v_claim, 'origin', o->>'origin'));
      end if;
    elsif o->>'op' = 'link_pages' then
      if o->>'page_a' = '$new' then v_page := v_new; else v_page := (o->>'page_a')::uuid; end if;
      if o->>'page_b' = '$new' then v_other := v_new; else v_other := (o->>'page_b')::uuid; end if;
      if v_page is null or v_other is null then raise exception 'no page was created in this batch'; end if;
      if v_page = v_other then raise exception 'a page cannot link to itself'; end if;
      if (select count(*) from public.page where id in (v_page, v_other) and user_id = v_user) <> 2 then
        raise exception 'link_pages: both pages must belong to this user';
      end if;
      insert into public.page_link (user_id, page_a, page_b, reason, capture_id, prompt_version)
      values (v_user, least(v_page, v_other), greatest(v_page, v_other), o->>'reason', p_capture_id, o->>'prompt_version')
      on conflict (page_a, page_b) do nothing
      returning id into v_id;
      if v_id is not null then
        insert into public.event_log (user_id, capture_id, page_id, kind, detail)
        values (v_user, p_capture_id, v_page, 'link_added', jsonb_build_object('link_id', v_id, 'other_page', v_other));
      end if;
      v_id := null;
    elsif o->>'op' = 'add_open_question' then
      if o->>'page' = '$new' then
        v_page := v_new;
        if v_page is null then raise exception 'no page was created in this batch'; end if;
      else
        select id into v_page from public.page where id = (o->>'page')::uuid and user_id = v_user;
        if v_page is null then raise exception 'page % not found for this user', o->>'page'; end if;
      end if;
      if (select count(*) from public.open_question where page_id = v_page and status = 'open') >= 3 then
        raise exception 'a page has at most 3 open questions';
      end if;
      insert into public.open_question (user_id, page_id, text, capture_id)
      values (v_user, v_page, o->>'text', p_capture_id) returning id into v_id;
      insert into public.event_log (user_id, capture_id, page_id, kind, detail)
      values (v_user, p_capture_id, v_page, 'question_added', jsonb_build_object('question_id', v_id));
      v_id := null;
    elsif o->>'op' = 'resolve_open_question' then
      update public.open_question set status = 'resolved', resolved_capture_id = p_capture_id
      where id = (o->>'question')::uuid and user_id = v_user and status = 'open'
      returning id, page_id into v_id, v_page;
      if v_id is null then raise exception 'open question % not found for this user', o->>'question'; end if;
      insert into public.event_log (user_id, capture_id, page_id, kind, detail)
      values (v_user, p_capture_id, v_page, 'question_resolved', jsonb_build_object('question_id', v_id));
      v_id := null;
    else
      raise exception 'unknown operation %', o->>'op';
    end if;
  end loop;

  -- One new version per touched page (R-KB-04); a page whose summary did not change keeps its latest one.
  foreach v_page in array v_touched loop
    select coalesce(max(version), 0) + 1 into v_version from public.page_version where page_id = v_page;
    if v_summaries ? v_page::text then
      v_summary := coalesce(array(select jsonb_array_elements_text(v_summaries->v_page::text)), '{}');
    else
      select summary into v_summary from public.page_version where page_id = v_page order by version desc limit 1;
    end if;
    insert into public.page_version (page_id, user_id, version, summary, cause_capture_id)
    values (v_page, v_user, v_version, coalesce(v_summary, '{}'), p_capture_id);
    insert into public.source_page (source_id, page_id, user_id) values (v_source, v_page, v_user) on conflict do nothing;
  end loop;
  return v_source;
end $$;

revoke all on function public.apply_ops(uuid, jsonb, jsonb) from public, anon, authenticated;

-- Shadow log of the link stage (D66): what it proposed for a source, applied or not. Server-only (RLS on, no policy),
-- one row per capture, like revision_shadow. Hugues reviews it with scripts/show-links.ts.
create table public.link_shadow (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  capture_id uuid not null unique references public.capture (id) on delete cascade,
  mode text not null check (mode in ('shadow', 'live')),
  prompt_version text not null,
  model text not null,
  reasoning text,
  -- The shortlist shown to the model (id, title, similarity).
  candidates jsonb not null default '[]',
  -- Links that passed the checks: candidate page id and title, reason, confidence.
  accepted jsonb not null default '[]',
  -- Proposals the checks refused, with the reason.
  rejected jsonb not null default '[]',
  error text,
  created_at timestamptz not null default now()
);
alter table public.link_shadow enable row level security;
