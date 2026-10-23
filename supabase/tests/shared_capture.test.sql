begin;
delete from auth.users;
select plan(10);

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'Alice@Example.test', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-00000000000b', 'b.ob@gmail.com', 'authenticated', 'authenticated', now()),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.test', 'authenticated', 'authenticated', null);

select is(public.capture_user_by_email('alice@example.test'), '00000000-0000-0000-0000-00000000000a'::uuid,
  '[R-CAP-12] the account email matches, ignoring case');
select is(public.capture_user_by_email('bob@gmail.com'), null, '[R-CAP-12] no Gmail dot folding');
select is(public.capture_user_by_email('nobody@example.test'), null, '[R-CAP-12] an unknown sender has no user');
select is(public.capture_user_by_email('carol@example.test'), null, '[R-ACC-02] an account whose address was never confirmed is not routed');
select is(public.capture_user_by_email(''), null, 'an empty address matches nobody');
select is(public.capture_user_by_email('%'), null, 'no pattern matching');

select has_column('public', 'capture', 'auth', 'capture.auth keeps the authentication result');
select col_default_is('public', 'capture', 'route', 'token', 'old captures are token captures');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok($$ select public.capture_user_by_email('alice@example.test') $$, '42501', null,
  '[R-SEC-01] a signed-in user cannot look up another account by email');
reset role;
set local role anon;
select throws_ok($$ select public.capture_user_by_email('alice@example.test') $$, '42501', null,
  '[R-SEC-01] anon cannot look up an account by email');
reset role;

select * from finish();
rollback;
