-- Beta slice (D53): per-user AI cost cap, reminder pause/unsubscribe, onboarding dismissal.

-- Cost cap (USD). Server-only columns: not in the user-updatable grant below, so only the service role changes them.
alter table public.profile
  add column ai_cap_day_usd numeric(6, 2) not null default 0.30 check (ai_cap_day_usd >= 0),
  add column ai_cap_month_usd numeric(7, 2) not null default 3.00 check (ai_cap_month_usd >= 0);

-- What a user's AI calls cost over the last 24 hours and the last 30 days (rows with an unknown price count as 0).
create function public.ai_spend(p_user_id uuid) returns table (day_usd numeric, month_usd numeric)
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(cost_usd) filter (where at > now() - interval '24 hours'), 0),
         coalesce(sum(cost_usd) filter (where at > now() - interval '30 days'), 0)
    from public.ai_call where user_id = p_user_id and at > now() - interval '30 days';
$$;

-- Puts a running job back without using one of its attempts (the cost cap holds it, nothing went wrong).
create function public.defer_job(p_id uuid, p_until timestamptz) returns void
language sql security invoker set search_path = '' as $$
  update public.job
     set status = 'queued', attempts = greatest(attempts - 1, 0), run_after = p_until, lease_until = null, updated_at = now()
   where id = p_id and status = 'running';
$$;

revoke all on function public.ai_spend(uuid) from public, anon, authenticated;
revoke all on function public.defer_job(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ai_spend(uuid) to service_role;
grant execute on function public.defer_job(uuid, timestamptz) to service_role;

alter table public.email_out drop constraint email_out_kind_check;
alter table public.email_out add constraint email_out_kind_check check (kind in ('receipt', 'reminder', 'quota'));

-- Reminder pause and unsubscribe (R-NOT-04), onboarding card dismissal (R-ONB-02).
alter table public.profile
  add column reminders_off boolean not null default false,
  add column reminders_paused_until timestamptz,
  add column onboarding_dismissed_at timestamptz;
grant update (reminders_off, reminders_paused_until, onboarding_dismissed_at) on public.profile to authenticated;

-- R-SEC-06: how many rows of any public table still carry this user id (a delete test must find none).
create function public.user_rows_count(p_user_id uuid) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare t record; n bigint; total bigint := 0;
begin
  for t in
    select c.table_name from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'user_id'
  loop
    execute format('select count(*) from public.%I where user_id = $1', t.table_name) into n using p_user_id;
    total := total + n;
  end loop;
  return total;
end $$;
revoke all on function public.user_rows_count(uuid) from public, anon, authenticated;
grant execute on function public.user_rows_count(uuid) to service_role;
