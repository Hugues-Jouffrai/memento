begin;
select plan(16);

select is((select relrowsecurity from pg_class where oid = 'public.waitlist'::regclass), true, '[R-LAND-05] row level security is on');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'waitlist'), 0, '[R-LAND-05] no policy: only the service role gets in');

select lives_ok($$ insert into public.waitlist (email, locale) values ('a@example.test', 'fr') $$, '[R-LAND-05] a normalised address is stored');
select throws_ok($$ insert into public.waitlist (email, locale) values ('a@example.test', 'en') $$, '23505', null, '[R-LAND-05] the same address twice is refused');
select throws_ok($$ insert into public.waitlist (email, locale) values ('A@Example.test', 'fr') $$, '23514', null, '[R-LAND-05] an upper-case address is refused');
select throws_ok($$ insert into public.waitlist (email, locale) values (' b@example.test', 'fr') $$, '23514', null, '[R-LAND-05] an address with spaces is refused');
select throws_ok($$ insert into public.waitlist (email, locale) values ('c@example.test', 'de') $$, '23514', null, '[R-LAND-05] an unknown language is refused');

set local role anon;
select is((select count(*)::int from public.waitlist), 0, '[R-LAND-05] anon reads nothing');
select throws_ok($$ insert into public.waitlist (email, locale) values ('d@example.test', 'fr') $$, '42501', null, '[R-LAND-05] anon cannot insert');
select throws_ok($$ select public.purge_waitlist() $$, '42501', null, '[R-LAND-05] anon cannot purge');
reset role;

set local role authenticated;
select is((select count(*)::int from public.waitlist), 0, '[R-LAND-05] a signed-in user reads nothing');
select throws_ok($$ insert into public.waitlist (email, locale) values ('e@example.test', 'fr') $$, '42501', null, '[R-LAND-05] a signed-in user cannot insert');
reset role;

insert into public.waitlist (email, locale, confirmed_at) values
  ('old@example.test', 'fr', now() - interval '13 months'),
  ('recent@example.test', 'en', now() - interval '11 months');
insert into public.rate_hit (key, at) values ('test:purge:old', now() - interval '2 days'), ('test:purge:new', now());

select is(public.purge_waitlist(), 1, '[R-LAND-05] the purge deletes the 13-month-old row only');
select is((select count(*)::int from public.waitlist where email = 'recent@example.test'), 1, '[R-LAND-05] the 11-month-old row stays');
select is((select array_agg(key order by key) from public.rate_hit where key like 'test:purge:%'), array['test:purge:new'], '[R-LAND-05] old rate-limit rows go, recent ones stay');
select is((select count(*)::int from cron.job where jobname = 'waitlist-purge'), 1, '[R-LAND-05] the daily purge job is scheduled');

select * from finish();
rollback;
