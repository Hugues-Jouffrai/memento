begin;
delete from auth.users;
select plan(4);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', 'authenticated', 'authenticated');
insert into public.capture (id, user_id, provider_message_id, from_address, raw) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'm1', 'a@example.test', '{}');
insert into public.capture (id, user_id, provider_message_id, from_address, raw, parent_id, position) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000a', 'm1#1', 'a@example.test', '{}',
   '00000000-0000-0000-0000-0000000000c1', 1);

select is((select parent_id::text from public.capture where id = '00000000-0000-0000-0000-0000000000c2'),
  '00000000-0000-0000-0000-0000000000c1', '[R-CAP-07] a further source of a mail points to the mail''s own capture');
select throws_ok($$ insert into public.capture (user_id, provider_message_id, from_address, raw, position)
  values ('00000000-0000-0000-0000-00000000000a', 'm2', 'a@example.test', '{}', -1) $$,
  '23514', null, '[R-CAP-07] a negative position is rejected');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
update public.capture set parent_id = null where id = '00000000-0000-0000-0000-0000000000c2';
reset role;
select is((select parent_id::text from public.capture where id = '00000000-0000-0000-0000-0000000000c2'),
  '00000000-0000-0000-0000-0000000000c1', '[R-SEC-01] a user cannot rewrite how their captures are grouped (no update policy)');

delete from public.capture where id = '00000000-0000-0000-0000-0000000000c1';
select is((select count(*)::int from public.capture where id = '00000000-0000-0000-0000-0000000000c2'), 0,
  '[R-CAP-07] deleting a mail''s own capture removes its further sources');

select * from finish();
rollback;
