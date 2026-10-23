begin;
-- Start from an empty user table whatever the database holds (rolled back at the end).
delete from auth.users;
select plan(17);

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
insert into public.card (id, user_id, claim_id, source_id, question, answer, rank) values
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', 'q1?', 'a', 1),
  ('00000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', 'q2?', 'a', 2),
  ('00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', 'q3?', 'a', 3);

-- B tries to keep A's card: nothing happens.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is(public.keep_cards(array['00000000-0000-0000-0000-000000000a01']::uuid[], '5.4.2'), 0,
  '[R-SEC-01] another user cannot keep my card');

-- A keeps two, discards one.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is(public.keep_cards(array['00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a02']::uuid[], '5.4.2'), 2,
  '[R-TRAY-01] keep activates the chosen cards');
select is(public.discard_cards(array['00000000-0000-0000-0000-000000000a03']::uuid[]), 1, '[R-TRAY-01] discard works');
select is(public.keep_cards(array['00000000-0000-0000-0000-000000000a01']::uuid[], '5.4.2'), 0, 'keeping twice changes nothing');
select is((select count(*)::int from public.fsrs_state), 2, '[R-TRAY-02] kept cards enter scheduling as new cards (one state each)');
select throws_ok($$ select public.record_review('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a01', 3, now(), 1000, '{}', '{}', 0, 'x') $$,
  '42501', null, 'authenticated users cannot call record_review directly');
reset role;

select is((select status from public.card where id = '00000000-0000-0000-0000-000000000a03'), 'discarded', 'discarded card status');
select is((select status from public.card where id = '00000000-0000-0000-0000-000000000a01'), 'active', 'kept card status');
select is((select state::int from public.fsrs_state where card_id = '00000000-0000-0000-0000-000000000a01'), 0, 'kept card is New');

-- record_review: log + state move together; a second submit with the old state is refused.
create temp table st as select due::text as due from public.fsrs_state where card_id = '00000000-0000-0000-0000-000000000a01';
select lives_ok($$
  select public.record_review('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a01', 3, now(), 4000,
    jsonb_build_object('due', (select due from st)),
    '{"due":"2030-01-01T00:00:00Z","stability":2.5,"difficulty":5,"elapsed_days":0,"scheduled_days":3,"learning_steps":0,"reps":1,"lapses":0,"state":2,"last_review":"2026-10-14T10:00:00Z"}'::jsonb,
    0, '5.4.2') $$, '[R-SCH-02] a review is recorded');
select is((select count(*)::int from public.review_log where card_id = '00000000-0000-0000-0000-000000000a01'), 1, '[R-SCH-02] one log row');
select is((select reps from public.fsrs_state where card_id = '00000000-0000-0000-0000-000000000a01'), 1, 'state moved with the log');
select throws_ok($$
  select public.record_review('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a01', 3, now(), 4000,
    jsonb_build_object('due', (select due from st)), '{"due":"2031-01-01T00:00:00Z","stability":1,"difficulty":5,"elapsed_days":0,"scheduled_days":3,"learning_steps":0,"reps":2,"lapses":0,"state":2,"last_review":null}'::jsonb,
    0, '5.4.2') $$, '40001', null, 'a double submit grades the card once');
select throws_ok($$
  select public.record_review('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000a01', 3, now(), 1,
    '{"due":"x"}', '{}', 0, 'x') $$, 'P0002', null, '[R-SEC-01] a review for a card the user does not own is refused');

-- [R-NOT-02] Reminders: users in 3 timezones, all at 18:00 local, are enqueued only when their local hour comes.
update public.profile set timezone = 'Pacific/Auckland' where user_id = '00000000-0000-0000-0000-00000000000a';
update public.profile set timezone = 'America/Los_Angeles' where user_id = '00000000-0000-0000-0000-00000000000b';
insert into auth.users (id, email, aud, role) values ('00000000-0000-0000-0000-00000000000c', 'c@example.test', 'authenticated', 'authenticated');
update public.profile set timezone = 'Europe/Paris' where user_id = '00000000-0000-0000-0000-00000000000c';

-- 2026-10-14 16:10 UTC = 18:10 Paris (CEST) = 09:10 Los Angeles = 05:10 (+1 day) Auckland.
select is(public.enqueue_reminders('2026-10-14T16:10:00Z'), 1, '[R-NOT-02] at 16:10 UTC only the Paris user is due');
select is(public.enqueue_reminders('2026-10-14T16:20:00Z'), 0, '[R-NOT-03] running again in the same hour enqueues nothing');
-- 2026-10-15 01:30 UTC = 18:30 Los Angeles (PDT) on Wednesday.
select is(public.enqueue_reminders('2026-10-15T01:30:00Z'), 1, '[R-NOT-02] at 01:30 UTC the Los Angeles user is due');

select * from finish();
rollback;
