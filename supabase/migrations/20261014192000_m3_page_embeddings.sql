-- M3 step 0b: page embeddings for topic matching (R-KB-02). gemini-embedding-2 at 768 dimensions (D40).
-- The model id is stored with each vector (spec section 15) so a model change never mixes spaces.
-- No vector index yet: matching is a per-user exact scan (hundreds of pages), which is exact and fast; HNSW comes
-- when a user has thousands of pages.
create extension if not exists vector with schema extensions;

alter table public.page add column embedding extensions.vector(768);
alter table public.page add column embedding_model text;
alter table public.page add constraint page_embedding_has_model check (embedding is null or embedding_model is not null);
