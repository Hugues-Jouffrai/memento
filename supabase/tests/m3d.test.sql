begin;
delete from auth.users;
select plan(10);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', 'authenticated', 'authenticated');
insert into public.capture (id, user_id, provider_message_id, from_address, raw) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'm1', 'a@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000a', 'm2', 'a@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-00000000000b', 'm3', 'b@example.test', '{}');

create function pg_temp.src(h text) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'user_note', 'title', 't', 'language', 'fr', 'text', 'texte ' || h, 'hash', h,
    'extractor', 'mail-v1', 'extractor_version', '1') $$;

select public.apply_ops('00000000-0000-0000-0000-0000000000c1', pg_temp.src('h1'), jsonb_build_array(
  jsonb_build_object('op', 'create_page', 'title', 'Abeilles', 'language', 'fr', 'summary', jsonb_build_array('Elles dansent')),
  jsonb_build_object('op', 'add_claim', 'page', '$new', 'text', 'Fait cité', 'origin', 'source', 'excerpt', 'texte h1'),
  jsonb_build_object('op', 'add_claim', 'page', '$new', 'text', 'Fait du modèle', 'origin', 'model')));

select is((select count(*)::int from public.claim), 2, '[R-KB-03] add_claim writes the claims');
select is((select count(*)::int from public.citation), 1, '[R-KB-05] only the source-origin claim is cited');
select is((select array_agg(kind order by created_at)::text from public.event_log),
  '{page_created,claim_added,claim_added}', '[R-KB-04] each operation is logged, in order');
select is((select summary::text from public.page_version where version = 1), '{"Elles dansent"}', '[R-KB-04] the first version carries the summary');

-- Idempotent: the same capture again changes nothing.
select public.apply_ops('00000000-0000-0000-0000-0000000000c1', pg_temp.src('h1'), jsonb_build_array(
  jsonb_build_object('op', 'create_page', 'title', 'Autre', 'language', 'fr', 'summary', jsonb_build_array('x'))));
select is((select count(*)::int from public.page), 1, '[R-PIPE-01] re-applying a capture creates nothing');

-- Extending a page without a new summary keeps the latest one in the new version.
select public.apply_ops('00000000-0000-0000-0000-0000000000c2', pg_temp.src('h2'), jsonb_build_array(
  jsonb_build_object('op', 'add_claim', 'page', (select id::text from public.page), 'text', 'Fait deux', 'origin', 'model')));
select is((select summary::text from public.page_version where version = 2), '{"Elles dansent"}', '[R-KB-04] an unchanged summary is carried to the new version');

-- All-or-nothing: a bad operation rolls the whole batch back, including the source.
select throws_ok($$ select public.apply_ops('00000000-0000-0000-0000-0000000000c3', pg_temp.src('h3'), jsonb_build_array(
  jsonb_build_object('op', 'create_page', 'title', 'B', 'language', 'fr', 'summary', jsonb_build_array('x')),
  jsonb_build_object('op', 'rewrite_page', 'page', '$new'))) $$, 'P0001', null, '[R-KB-03] an unknown operation raises');
select is((select count(*)::int from public.source where capture_id = '00000000-0000-0000-0000-0000000000c3'), 0,
  '[R-KB-03] a failed batch leaves no source behind');
select throws_ok($$ select public.apply_ops('00000000-0000-0000-0000-0000000000c3', pg_temp.src('h3'), jsonb_build_array(
  jsonb_build_object('op', 'add_claim', 'page', (select id::text from public.page limit 1), 'text', 'x', 'origin', 'model'))) $$,
  'P0001', null, '[R-SEC-01] a batch cannot write to another user''s page');

-- The log is append-only.
select throws_ok($$ update public.event_log set kind = 'claim_added' $$, 'P0001', null, '[R-KB-04] event_log rows cannot be updated');

select * from finish();
rollback;
