-- D54 / R-LAND-05: visitors who asked to be told once when the product opens to everyone.
-- Server-only (RLS on, no policy), like invite_code and rate_hit. A row exists only after its owner confirmed.

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
    check (email = lower(btrim(email)) and char_length(email) between 3 and 254 and position('@' in email) > 1),
  -- Language of the opening announcement.
  locale text not null check (locale in ('fr', 'en')),
  confirmed_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;

-- Retention: 12 months after confirmation (WAITLIST_RETENTION_MONTHS in src/domain/waitlist.ts must match).
-- Also clears rate-limit rows older than a day, so hashed keys never outlive two days even when nobody calls rate_check.
create function public.purge_waitlist() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.waitlist where confirmed_at < now() - interval '12 months';
  get diagnostics n = row_count;
  delete from public.rate_hit where at < now() - interval '1 day';
  return n;
end $$;
revoke all on function public.purge_waitlist() from public, anon, authenticated;
grant execute on function public.purge_waitlist() to service_role;

select cron.schedule('waitlist-purge', '17 3 * * *', $$ select public.purge_waitlist() $$);
