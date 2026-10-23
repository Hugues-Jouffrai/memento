-- D52 / R-ACC-02: one universal invite link. Sign-ups stay closed (D28); the link is the only way in.
-- All tables are server-only (RLS on, no policy), like ai_call.

create table public.invite_code (
  id uuid primary key default gen_random_uuid(),
  -- SHA-256 (hex) of the code in the link. The code itself is never stored.
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  label text,
  max_uses integer not null check (max_uses > 0),
  uses integer not null default 0 check (uses >= 0 and uses <= max_uses),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.invite_code enable row level security;

create table public.invite_use (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invite_code (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (email)
);
alter table public.invite_use enable row level security;

-- Request counters for the join page. Keys are hashes, never raw addresses.
create table public.rate_hit (
  key text not null,
  at timestamptz not null default now()
);
create index rate_hit_key_idx on public.rate_hit (key, at);
alter table public.rate_hit enable row level security;

-- True when the request is allowed (and counted). Old rows are dropped on the way.
create function public.rate_check(p_key text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.rate_hit where at < now() - interval '1 day';
  select count(*) into n from public.rate_hit where key = p_key and at > now() - make_interval(secs => p_window_seconds);
  if n >= p_limit then return false; end if;
  insert into public.rate_hit (key) values (p_key);
  return true;
end $$;

-- Redeems the code for an address, atomically. Returns:
--   'invalid'  the code is unknown, revoked, expired or used up (nothing changes)
--   'existing' the address already has an account: nothing is consumed, the caller just sends a sign-in mail
--   'ok'       one use was taken; the caller creates the account (and calls release_invite if that fails)
create function public.redeem_invite(p_code_hash text, p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  p_email := lower(btrim(p_email));
  select id into v_id from public.invite_code
   where code_hash = p_code_hash and revoked_at is null and expires_at > now() and uses < max_uses;
  if v_id is null then return 'invalid'; end if;
  if exists (select 1 from auth.users u where lower(btrim(u.email)) = p_email and u.deleted_at is null) then return 'existing'; end if;
  -- One statement takes the use, so two simultaneous requests cannot exceed max_uses.
  update public.invite_code set uses = uses + 1
   where id = v_id and revoked_at is null and expires_at > now() and uses < max_uses;
  if not found then return 'invalid'; end if;
  insert into public.invite_use (invite_id, email) values (v_id, p_email);
  return 'ok';
exception when unique_violation then
  -- The same address raced itself: the first request owns the use.
  return 'existing';
end $$;

-- Gives the use back when the account could not be created.
create function public.release_invite(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  delete from public.invite_use where email = lower(btrim(p_email)) returning invite_id into v_id;
  if v_id is not null then update public.invite_code set uses = uses - 1 where id = v_id and uses > 0; end if;
end $$;

revoke all on function public.rate_check(text, integer, integer) from public, anon, authenticated;
revoke all on function public.redeem_invite(text, text) from public, anon, authenticated;
revoke all on function public.release_invite(text) from public, anon, authenticated;
grant execute on function public.rate_check(text, integer, integer) to service_role;
grant execute on function public.redeem_invite(text, text) to service_role;
grant execute on function public.release_invite(text) to service_role;

-- An invited account exists before its address is proven, so `add@` only trusts confirmed accounts.
create or replace function public.capture_user_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when count(*) = 1 then min(u.id::text)::uuid end
    from auth.users u
   where p_email is not null and btrim(p_email) <> ''
     and lower(btrim(u.email)) = lower(btrim(p_email))
     and u.email_confirmed_at is not null
     and u.deleted_at is null;
$$;
