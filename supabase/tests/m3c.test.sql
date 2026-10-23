begin;
delete from auth.users;
select plan(4);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', 'authenticated', 'authenticated');
insert into public.capture (id, user_id, provider_message_id, from_address, raw) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'm1', 'a@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000a', 'm2', 'a@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-00000000000b', 'm3', 'b@example.test', '{}');

-- One page for user A (writes go through apply_ops, tested in m3d).
insert into public.source (id, user_id, capture_id, kind, extracted_text, content_hash, extractor, extractor_version) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'user_note', 'x', 'h1', 't', '1');
insert into public.page (id, user_id, source_id, title) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000d1', 'Abeilles');

-- Similarity search: the closest page of the right user and model first.
update public.page set embedding = (select array_agg(case when g = 1 then 1.0::real else 0.0::real end) from generate_series(1, 768) g)::extensions.vector,
  embedding_model = 'm' where user_id = '00000000-0000-0000-0000-00000000000a';
select is((select title from public.match_pages('00000000-0000-0000-0000-00000000000a',
  (select array_agg(case when g = 1 then 1.0::real else 0.0::real end) from generate_series(1, 768) g)::extensions.vector, 'm', 5) limit 1),
  'Abeilles', '[R-KB-02] match_pages finds the closest page');
select is((select count(*)::int from public.match_pages('00000000-0000-0000-0000-00000000000a',
  (select array_agg(0.1::real) from generate_series(1, 768))::extensions.vector, 'another-model', 5)), 0, '[R-KB-02] vectors of another model are never compared');
select is((select count(*)::int from public.match_pages('00000000-0000-0000-0000-00000000000b',
  (select array_agg(0.1::real) from generate_series(1, 768))::extensions.vector, 'm', 5)), 0, '[R-SEC-01] match_pages only sees the user''s own pages');

-- One extract job per user at a time.
select public.enqueue_job('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'extract', 'x1');
select public.enqueue_job('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c2', 'extract', 'x2');
update public.job set status = 'running', lease_until = now() + interval '1 minute', attempts = 1 where idempotency_key = 'x1';
select is((select count(*)::int from public.claim_jobs(5, 60) where stage = 'extract'), 0,
  '[R-KB-02] a second extract job of the same user waits while one is running');

select * from finish();
rollback;
