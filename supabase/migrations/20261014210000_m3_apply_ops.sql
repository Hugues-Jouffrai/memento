-- M3 step 2: structured updates (R-KB-03, R-KB-04). The server validates a batch of operations (src/domain/kb.ts) and
-- this function applies it in one transaction: the source, the page changes, one new page version per touched page,
-- and one event_log row per operation. store_extraction stays for the code that is still deployed; it is dropped later.

-- What each capture changed (the second brain's source-log). Append-only; users read their own.
create table public.event_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  capture_id uuid not null references public.capture (id) on delete cascade,
  page_id uuid references public.page (id) on delete set null,
  kind text not null check (kind in ('page_created', 'claim_added', 'summary_set')),
  detail jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);
create index event_log_capture_idx on public.event_log (capture_id, created_at);
create index event_log_page_idx on public.event_log (page_id, created_at);
create trigger event_log_append_only before update on public.event_log
  for each row execute function public.forbid_update();
alter table public.event_log enable row level security;
create policy event_log_select on public.event_log for select to authenticated using (user_id = (select auth.uid()));

-- p_ops: array of {op: create_page | add_claim | set_summary, ...}; "$new" names the page a create_page makes.
create function public.apply_ops(p_capture_id uuid, p_source jsonb, p_ops jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid;
  v_source uuid;
  v_new uuid;
  v_page uuid;
  v_claim uuid;
  v_summaries jsonb := '{}';
  v_touched uuid[] := '{}';
  v_version integer;
  v_summary text[];
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
