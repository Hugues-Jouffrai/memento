begin;
delete from auth.users;
select plan(6);

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'dana@example.test', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-0000000000d2', 'eli@example.test', 'authenticated', 'authenticated', now());

select has_column('public', 'profile', 'welcome_done_at', '[R-ONB-07] profile has welcome_done_at');
select is((select welcome_done_at from public.profile where user_id = '00000000-0000-0000-0000-0000000000d1'), null,
  '[R-ONB-07] a new profile has not seen the walkthrough');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select lives_ok($$ update public.profile set welcome_done_at = now() where user_id = '00000000-0000-0000-0000-0000000000d1' $$,
  '[R-ONB-07] a user can mark their own walkthrough done');
select isnt((select welcome_done_at from public.profile where user_id = '00000000-0000-0000-0000-0000000000d1'), null,
  '[R-ONB-07] the flag is stored');
update public.profile set welcome_done_at = now() where user_id = '00000000-0000-0000-0000-0000000000d2';
reset role;
select is((select welcome_done_at from public.profile where user_id = '00000000-0000-0000-0000-0000000000d2'), null,
  '[R-SEC-01] a user cannot change another user''s flag');
select is((select count(*) from public.profile where welcome_done_at is not null), 1::bigint, 'only one profile was marked');

select * from finish();
rollback;
