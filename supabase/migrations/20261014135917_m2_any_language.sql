-- R-PIPE-04: a source can be in any language (ISO 639-1 code). Only the UI is limited to fr/en.
alter table public.source drop constraint source_language_check;
alter table public.source add constraint source_language_check check (language ~ '^[a-z]{2}$');
alter table public.page drop constraint page_language_check;
alter table public.page add constraint page_language_check check (language ~ '^[a-z]{2}$');

-- Claims inserted in one transaction used to share now(), which lost their importance order. Use the wall clock.
create or replace function public.store_extraction(p_capture_id uuid, p_payload jsonb) returns uuid
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
    insert into public.claim (user_id, page_id, text, origin, created_at)
    values (v_user, v_page, c->>'text', coalesce(c->>'origin', 'source'), clock_timestamp())
    returning id into v_claim;
    -- R-KB-05: a claim of origin 'source' always gets its citation; 'model' claims have none.
    if coalesce(c->>'origin', 'source') = 'source' then
      insert into public.citation (claim_id, source_id, user_id, excerpt)
      values (v_claim, v_source, v_user, c->>'excerpt');
    end if;
  end loop;
  return v_source;
end $$;
