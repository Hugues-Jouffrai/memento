-- D50 (R-CAP-12, R-CAP-03): the shared address add@<capture domain>, routed by the authenticated From address.
-- route: which address the mail came through; auth: Resend's authentication result and the decision taken on it,
-- kept so every accept or reject is auditable.
alter table public.capture
  add column route text not null default 'token' check (route in ('token', 'shared')),
  add column auth jsonb;

-- The user whose account email is exactly p_email (already parsed and lowercased by the server), normalised like
-- isAcceptedSender (trim + lowercase, no Gmail dot folding). Null when no user, or more than one, matches.
-- Server only (service role): it reads auth.users, so it must never be callable by signed-in users or anon.
create function public.capture_user_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when count(*) = 1 then min(u.id::text)::uuid end
    from auth.users u
   where p_email is not null and btrim(p_email) <> ''
     and lower(btrim(u.email)) = lower(btrim(p_email))
     and u.deleted_at is null;
$$;

revoke all on function public.capture_user_by_email(text) from public, anon, authenticated;
grant execute on function public.capture_user_by_email(text) to service_role;
