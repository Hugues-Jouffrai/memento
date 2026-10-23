begin;
delete from auth.users;
select plan(17);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', 'authenticated', 'authenticated');
insert into public.capture (id, user_id, provider_message_id, from_address, raw) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'm1', 'a@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000a', 'm2', 'a@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-00000000000b', 'm3', 'b@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-00000000000a', 'm4', 'a@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-00000000000a', 'm5', 'a@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-00000000000a', 'm6', 'a@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-00000000000a', 'm7', 'a@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c8', '00000000-0000-0000-0000-00000000000a', 'm8', 'a@example.test', '{}');

create function pg_temp.src(h text) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'user_note', 'title', 't', 'language', 'fr', 'text', 'texte ' || h, 'hash', h,
    'extractor', 'mail-v1', 'extractor_version', '1') $$;
create function pg_temp.mk(t text) returns jsonb language sql as $$
  select jsonb_build_object('op', 'create_page', 'title', t, 'language', 'fr', 'summary', jsonb_build_array('x')) $$;

select public.apply_ops('00000000-0000-0000-0000-0000000000c1', pg_temp.src('h1'), jsonb_build_array(pg_temp.mk('Cicéron')));
create temp table p1 as select id from public.page where title = 'Cicéron';

-- A second page, linked to the first in the same batch, with two open questions.
select public.apply_ops('00000000-0000-0000-0000-0000000000c2', pg_temp.src('h2'), jsonb_build_array(
  pg_temp.mk('Guerre sociale'),
  jsonb_build_object('op', 'link_pages', 'page_a', '$new', 'page_b', (select id::text from p1), 'reason', 'Cicéron a vécu la guerre'),
  jsonb_build_object('op', 'add_open_question', 'page', '$new', 'text', 'Pourquoi 91 ?'),
  jsonb_build_object('op', 'add_open_question', 'page', '$new', 'text', 'Qui a gagné ?')));

select is((select count(*)::int from public.page_link), 1, '[R-KB-12] link_pages stores one link, even for the page the batch creates');
select ok((select page_a < page_b from public.page_link), '[R-KB-12] a pair is stored in a fixed order');
select is((select count(*)::int from public.open_question where status = 'open'), 2, '[R-KB-14] add_open_question stores the questions');
select is((select array_agg(kind order by created_at)::text from public.event_log where capture_id = '00000000-0000-0000-0000-0000000000c2'),
  '{page_created,link_added,question_added,question_added}', '[R-KB-04] links and questions are logged');
select is((select count(*)::int from public.page_version), 2, '[R-KB-04] links and questions add no page version');

-- The same pair again changes nothing (also when it was removed).
update public.page_link set status = 'removed';
select public.apply_ops('00000000-0000-0000-0000-0000000000c4', pg_temp.src('h4'), jsonb_build_array(
  jsonb_build_object('op', 'link_pages', 'page_a', (select id::text from p1), 'page_b', (select id::text from public.page where title = 'Guerre sociale'), 'reason', 'encore')));
select is((select status from public.page_link), 'removed', '[R-KB-13] a removed pair is not brought back');
select is((select count(*)::int from public.page_link), 1, '[R-KB-13] a repeated pair makes no second row');

-- Self-link and cross-user link are refused, and the batch leaves nothing behind.
select throws_ok($$ select public.apply_ops('00000000-0000-0000-0000-0000000000c5', pg_temp.src('h5'), jsonb_build_array(
  jsonb_build_object('op', 'link_pages', 'page_a', (select id::text from p1), 'page_b', (select id::text from p1), 'reason', 'x'))) $$,
  'P0001', null, '[R-KB-12] a page cannot link to itself');
select throws_ok($$ select public.apply_ops('00000000-0000-0000-0000-0000000000c3', pg_temp.src('h3'), jsonb_build_array(
  pg_temp.mk('Page de B'),
  jsonb_build_object('op', 'link_pages', 'page_a', '$new', 'page_b', (select id::text from p1), 'reason', 'x'))) $$,
  'P0001', null, '[R-SEC-01] a link cannot reach another user''s page');
select is((select count(*)::int from public.source where capture_id = '00000000-0000-0000-0000-0000000000c3'), 0, '[R-SEC-01] the refused batch leaves no source');

-- At most 3 open questions per page; resolving frees a slot.
select public.apply_ops('00000000-0000-0000-0000-0000000000c6', pg_temp.src('h8'), jsonb_build_array(
  jsonb_build_object('op', 'add_open_question', 'page', (select id::text from public.page where title = 'Guerre sociale'), 'text', 'Trois ?')));
select throws_ok($$ select public.apply_ops('00000000-0000-0000-0000-0000000000c7', pg_temp.src('h6'), jsonb_build_array(
  jsonb_build_object('op', 'add_open_question', 'page', (select id::text from public.page where title = 'Guerre sociale'), 'text', 'Quatre ?'))) $$,
  'P0001', null, '[R-KB-14] a page has at most 3 open questions');
create temp table q as select id from public.open_question where text = 'Pourquoi 91 ?';
select public.apply_ops('00000000-0000-0000-0000-0000000000c8', pg_temp.src('h7'), jsonb_build_array(
  jsonb_build_object('op', 'resolve_open_question', 'question', (select id::text from q))));
select is((select status from public.open_question where id = (select id from q)), 'resolved', '[R-KB-14] a later source resolves a question');

insert into public.link_shadow (user_id, capture_id, mode, prompt_version, model)
values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'shadow', 'v1', 'gemini-3.8-flash');

-- RLS: a signed-in user reads their own rows, changes only the status, never inserts.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from public.page_link), 1, '[R-SEC-01] a user reads their own links');
select throws_ok($$ update public.page_link set reason = 'changé' $$, '42501', null, '[R-SEC-01] a user cannot rewrite a link''s reason');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.page_link) + (select count(*)::int from public.open_question), 0, '[R-SEC-01] another user sees no links or questions');
select is((select count(*)::int from public.link_shadow), 0, '[R-SEC-01] the link shadow log is not readable by a user');
reset role;
select is((select count(*)::int from public.link_shadow), 1, '[R-KB-12] link_shadow stores one row per capture');

select * from finish();
rollback;
