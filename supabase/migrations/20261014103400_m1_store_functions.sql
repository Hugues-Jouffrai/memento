-- Transactional, idempotent writes for the pipeline. Service role only.
-- One source per capture in M1 (a capture yields either the forwarded content or the user's own note).
alter table public.source add constraint source_capture_unique unique (capture_id);

-- Stores source + page + first page version + claims + citations in one transaction.
-- Re-running for the same capture returns the existing source id and writes nothing (R-PIPE-01).
create function public.store_extraction(p_capture_id uuid, p_payload jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid;
  v_source uuid;
  v_page uuid;
  v_claim uuid;
  c jsonb;
begin
  select user_id into v_user from public.capture where id = p_capture_id for update;
  if v_user is null then raise exception 'capture % not found', p_capture_id; end if;

  select id into v_source from public.source where capture_id = p_capture_id;
  if v_source is not null then return v_source; end if;

  insert into public.source (user_id, capture_id, kind, title, language, extracted_text, content_hash, extractor, extractor_version)
  values (v_user, p_capture_id, p_payload->>'kind', p_payload->>'title', p_payload->>'language',
          p_payload->>'text', p_payload->>'hash', p_payload->>'extractor', p_payload->>'extractor_version')
  returning id into v_source;

  insert into public.page (user_id, source_id, title, language)
  values (v_user, v_source, p_payload->>'page_title', p_payload->>'language')
  returning id into v_page;

  insert into public.page_version (page_id, user_id, version, summary, cause_capture_id)
  values (v_page, v_user, 1,
          coalesce(array(select jsonb_array_elements_text(p_payload->'summary')), '{}'), p_capture_id);

  for c in select * from jsonb_array_elements(p_payload->'claims') loop
    insert into public.claim (user_id, page_id, text, origin)
    values (v_user, v_page, c->>'text', coalesce(c->>'origin', 'source'))
    returning id into v_claim;
    -- R-KB-05: a claim of origin 'source' always gets its citation here.
    if coalesce(c->>'origin', 'source') = 'source' then
      insert into public.citation (claim_id, source_id, user_id, excerpt)
      values (v_claim, v_source, v_user, c->>'excerpt');
    end if;
  end loop;
  return v_source;
end $$;

-- Stores proposed cards for a source. Re-running writes nothing if the source already has cards.
create function public.store_cards(p_source_id uuid, p_cards jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid;
  n integer := 0;
  c jsonb;
begin
  select user_id into v_user from public.source where id = p_source_id for update;
  if v_user is null then raise exception 'source % not found', p_source_id; end if;
  if exists (select 1 from public.card where source_id = p_source_id) then return 0; end if;
  for c in select * from jsonb_array_elements(p_cards) loop
    insert into public.card (user_id, claim_id, source_id, question, answer, rank)
    values (v_user, (c->>'claim_id')::uuid, p_source_id, c->>'question', c->>'answer', (c->>'rank')::int);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.store_extraction(uuid, jsonb), public.store_cards(uuid, jsonb)
  from public, anon, authenticated;
