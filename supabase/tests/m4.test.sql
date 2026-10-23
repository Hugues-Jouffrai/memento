begin;
delete from auth.users;
select plan(9);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', 'authenticated', 'authenticated');
insert into public.capture (id, user_id, provider_message_id, from_address, raw) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'm1', 'a@example.test', '{}');
insert into public.source (id, user_id, capture_id, kind, extracted_text, content_hash, extractor, extractor_version) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'email_body', 'x', 'h', 't', '1');
insert into public.page (id, user_id, source_id, title) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000d1', 'A');
insert into public.claim (id, user_id, page_id, text, origin) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000e1', 'ca', 'source');
insert into public.card (id, user_id, claim_id, source_id, question, answer, status) values
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', 'q?', 'a', 'active'),
  ('00000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', 'q2?', 'a2', 'discarded');
insert into public.fsrs_state (card_id, user_id, fsrs_version, due, reps, state) values
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-00000000000a', '5.4.2', '2030-01-01', 3, 2);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is(public.edit_card('00000000-0000-0000-0000-000000000a01', 'hacked?', 'x'), null, '[R-SEC-01] another user cannot edit my card');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is(public.edit_card('00000000-0000-0000-0000-000000000a01', '  Better question?  ', 'Better answer'), 2, '[R-CARD-07] editing returns the new version');
select is(public.edit_card('00000000-0000-0000-0000-000000000a02', 'new?', 'new'), null, 'a discarded card cannot be edited');
select throws_ok($$ select public.edit_card('00000000-0000-0000-0000-000000000a01', '   ', 'a') $$, '22023', null, 'an empty question is refused');
select throws_ok($$ select public.edit_card('00000000-0000-0000-0000-000000000a01', 'q', repeat('x', 1001)) $$, '22023', null, 'an overlong answer is refused');
-- Suspending is a plain status update the user may already do (R-CARD-07).
select lives_ok($$ update public.card set status = 'suspended' where id = '00000000-0000-0000-0000-000000000a01' $$, '[R-CARD-07] the user can suspend a card');
reset role;

select is((select question from public.card where id = '00000000-0000-0000-0000-000000000a01'), 'Better question?', 'question trimmed and saved');
select is((select reps from public.fsrs_state where card_id = '00000000-0000-0000-0000-000000000a01'), 3, '[R-SCH-02] scheduling state untouched by an edit');
select is((select status from public.card where id = '00000000-0000-0000-0000-000000000a01'), 'suspended', 'status is suspended');

select * from finish();
rollback;
