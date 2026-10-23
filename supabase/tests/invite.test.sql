begin;
delete from auth.users;
select plan(8);

insert into public.invite_code (id, code_hash, max_uses, expires_at) values
  ('00000000-0000-0000-0000-0000000000a1', repeat('a', 64), 1, now() + interval '1 day'),
  ('00000000-0000-0000-0000-0000000000a2', repeat('b', 64), 5, now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000000a3', repeat('c', 64), 5, now() + interval '1 day');
update public.invite_code set revoked_at = now() where id = '00000000-0000-0000-0000-0000000000a3';

select is(public.redeem_invite(repeat('a', 64), 'New@Example.test'), 'ok', '[R-ACC-02] a valid code takes a use');
select is((select uses from public.invite_code where id = '00000000-0000-0000-0000-0000000000a1'), 1, '[R-ACC-02] the use is counted');
select is(public.redeem_invite(repeat('a', 64), 'other@example.test'), 'invalid', '[R-ACC-02] a used-up code is refused');
select is(public.redeem_invite(repeat('b', 64), 'x@example.test'), 'invalid', '[R-ACC-02] an expired code is refused');
select is(public.redeem_invite(repeat('c', 64), 'x@example.test'), 'invalid', '[R-ACC-02] a revoked code is refused');

select lives_ok($$ select public.release_invite('new@example.test') $$, 'a use can be given back');
select is((select uses from public.invite_code where id = '00000000-0000-0000-0000-0000000000a1'), 0, '[R-ACC-02] the use came back');

set local role authenticated;
select throws_ok($$ select public.redeem_invite(repeat('a', 64), 'y@example.test') $$, '42501', null,
  '[R-SEC-01] a signed-in user cannot redeem an invite');
reset role;

select * from finish();
rollback;
