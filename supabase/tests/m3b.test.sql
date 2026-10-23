begin;
delete from auth.users;
select plan(5);

select has_extension('vector', '[R-KB-02] pgvector is installed');

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', 'authenticated', 'authenticated');
insert into public.capture (id, user_id, provider_message_id, from_address, raw) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'm1', 'a@example.test', '{}');
insert into public.source (id, user_id, capture_id, kind, extracted_text, content_hash, extractor, extractor_version) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'user_note', 'x', 'h1', 'mail-v1', '1');
insert into public.page (id, user_id, source_id, title) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000d1', 'Abeilles');

select lives_ok($$ update public.page set embedding = (select array_agg(0.01::real) from generate_series(1, 768))::extensions.vector, embedding_model = 'gemini-embedding-2'
  where id = '00000000-0000-0000-0000-0000000000e1' $$, '[R-KB-02] a 768-dimension embedding is stored with its model id');
select throws_ok($$ update public.page set embedding = (select array_agg(0.01::real) from generate_series(1, 3072))::extensions.vector, embedding_model = 'gemini-embedding-2'
  where id = '00000000-0000-0000-0000-0000000000e1' $$, '22000', null, '[R-KB-02] a vector of another dimension is rejected');
select throws_ok($$ update public.page set embedding = (select array_agg(0.01::real) from generate_series(1, 768))::extensions.vector, embedding_model = null
  where id = '00000000-0000-0000-0000-0000000000e1' $$, '23514', null, '[R-KB-02] an embedding without its model id is rejected');
select is((select round((embedding operator(extensions.<=>) embedding)::numeric, 6) from public.page where id = '00000000-0000-0000-0000-0000000000e1'), 0::numeric,
  '[R-KB-02] cosine distance works on stored embeddings');

select * from finish();
rollback;
