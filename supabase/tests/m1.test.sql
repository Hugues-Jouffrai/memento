begin;
-- Start from an empty user table whatever the database holds (rolled back at the end).
delete from auth.users;
select plan(23);

-- Two users; the trigger creates their profile and capture address.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', 'authenticated', 'authenticated');

select is((select count(*)::int from public.profile where user_id in
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')), 2,
  '[R-ACC-04] a profile is created for each new user');
select is((select count(*)::int from public.capture_address where length(token) = 20), 2,
  '[R-CAP-01] each user gets a 20-char capture token');
select is((select count(distinct token)::int from public.capture_address), (select count(*)::int from public.capture_address),
  '[R-CAP-01] capture tokens are unique');

-- Defaults match D9.
select results_eq(
  $$ select daily_minutes, max_new_cards, desired_retention, reminder_time::text, study_days from public.profile
     where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  $$ values (10, 5, 0.90::numeric, '18:00:00', '{0,1,2,3,4,5,6}'::smallint[]) $$,
  '[R-ACC-05] defaults: 10 min, 5 new, retention 0.90, 18:00, all 7 days');

-- Settings limits are enforced by the database (R-ACC-05, R-ACC-06).
select throws_ok($$ update public.profile set daily_minutes = 7 where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, '[R-ACC-05] daily minutes outside {3,6,10,15,20} is rejected');
select throws_ok($$ update public.profile set desired_retention = 0.99 where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, '[R-ACC-06] retention above 0.95 is rejected');
select throws_ok($$ update public.profile set desired_retention = 0.5 where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, '[R-ACC-06] retention below 0.80 is rejected');
select throws_ok($$ update public.profile set study_days = '{}' where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, '[R-ACC-05] zero study days is rejected');
select throws_ok($$ update public.profile set study_days = '{7}' where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  '23514', null, '[R-ACC-05] a weekday outside 0..6 is rejected');

-- Fixture rows for user A and B (as the table owner).
insert into public.capture (id, user_id, provider_message_id, from_address, raw) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'm1', 'a@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000b', 'm1', 'b@example.test', '{}');
insert into public.source (id, user_id, capture_id, kind, extracted_text, content_hash, extractor, extractor_version) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'email_body', 'x', 'h', 't', '1'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000c2', 'email_body', 'y', 'h', 't', '1');
insert into public.page (id, user_id, source_id, title) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000d1', 'A'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000d2', 'B');
insert into public.claim (id, user_id, page_id, text, origin) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000e1', 'ca', 'source'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000e2', 'cb', 'source');
insert into public.card (id, user_id, claim_id, source_id, question, answer) values
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', 'q', 'a'),
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d2', 'q', 'a');
insert into public.review_log (user_id, card_id, card_version, rating, state_before, state_after, fsrs_version) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000a01', 1, 3, '{}', '{}', '5.4.2');

-- [R-SEC-01] Cross-tenant: user A sees only A's rows in every user table.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.profile), 1, '[R-SEC-01] A sees only their profile');
select is((select count(*)::int from public.capture_address), 1, '[R-SEC-01] A sees only their capture address');
select is((select count(*)::int from public.capture), 1, '[R-SEC-01] A sees only their captures');
select is((select count(*)::int from public.source), 1, '[R-SEC-01] A sees only their sources');
select is((select count(*)::int from public.page), 1, '[R-SEC-01] A sees only their pages');
select is((select count(*)::int from public.claim), 1, '[R-SEC-01] A sees only their claims');
select is((select count(*)::int from public.card), 1, '[R-SEC-01] A sees only their cards');

-- A cannot change B's card or profile (the update matches no row), nor touch job / email_out.
update public.card set status = 'active' where id = '00000000-0000-0000-0000-000000000b01';
update public.profile set language = 'en' where user_id = '00000000-0000-0000-0000-00000000000b';
select is((select count(*)::int from public.job), 0, '[R-SEC-01] authenticated sees no job rows');
select throws_ok($$ select public.claim_jobs(1, 60) $$, '42501', null, '[R-SEC-02] authenticated cannot claim jobs');
select throws_ok($$ update public.card set question = 'hacked' where id = '00000000-0000-0000-0000-000000000a01' $$,
  '42501', null, '[R-SEC-01] a user cannot rewrite card content, only its status');
reset role;

select is((select status from public.card where id = '00000000-0000-0000-0000-000000000b01'), 'proposed',
  '[R-SEC-01] A could not change B''s card');
select is((select language from public.profile where user_id = '00000000-0000-0000-0000-00000000000b'), 'fr',
  '[R-SEC-01] A could not change B''s profile');

-- Append-only tables (R-KB-01, R-SCH-02).
select throws_ok($$ update public.source set extracted_text = 'z' $$, 'P0001', null, '[R-KB-01] source text cannot be updated');
select throws_ok($$ update public.review_log set rating = 1 $$, 'P0001', null, '[R-SCH-02] review_log cannot be updated');

select * from finish();
rollback;
