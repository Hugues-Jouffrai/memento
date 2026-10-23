begin;
delete from auth.users;
select plan(6);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', 'authenticated', 'authenticated');
insert into public.capture (id, user_id, provider_message_id, from_address, raw) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'm1', 'a@example.test', '{}');

insert into public.revision_shadow (user_id, capture_id, prompt_version, model, findings, would_do)
values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'v1', 'gemini-3.8-flash',
  '[{"kind":"contradiction"}]', '[{"kind":"contradiction_flagged"}]');

select is((select count(*)::int from public.revision_shadow), 1, '[R-KB-06] a shadow row is stored');
select throws_ok($$ insert into public.revision_shadow (user_id, capture_id, prompt_version, model)
  values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'v1', 'm') $$,
  '23505', null, '[R-KB-06] one shadow row per capture');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*)::int from public.revision_shadow), 0, '[R-SEC-01] the signed-in user cannot read shadow rows');
select throws_ok($$ insert into public.revision_shadow (user_id, capture_id, prompt_version, model)
  values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'v1', 'm') $$,
  '42501', null, '[R-SEC-01] the signed-in user cannot write shadow rows');
reset role;
set local role anon;
select is((select count(*)::int from public.revision_shadow), 0, '[R-SEC-01] anon sees no shadow rows');
reset role;

delete from public.capture;
select is((select count(*)::int from public.revision_shadow), 0, '[R-SEC-01] shadow rows go with their capture');

select * from finish();
rollback;
