-- M3 step 0: several sources per mail. A mail with several links or files becomes a group of captures:
-- the first item is the mail's own capture (the parent), each further item is a child capture with its own
-- pipeline (one source per capture still holds). One combined receipt is sent once every member is finished.
-- parent_id / position are written by the server only (no column grants for users).
alter table public.capture add column parent_id uuid references public.capture (id) on delete cascade;
alter table public.capture add column position smallint not null default 0 check (position >= 0);
create index capture_parent_idx on public.capture (parent_id) where parent_id is not null;
