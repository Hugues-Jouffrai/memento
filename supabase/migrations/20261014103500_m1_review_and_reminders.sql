-- Tray actions (R-TRAY-01), review recording (R-SCH-02), reminder scheduling (R-NOT-01..03) and cron wiring (D17).

-- Keep: proposed -> active, and the card enters scheduling as a new card. Runs as the signed-in user.
create function public.keep_cards(p_ids uuid[], p_fsrs_version text) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  with kept as (
    update public.card set status = 'active', kept_at = now()
     where id = any(p_ids) and user_id = auth.uid() and status = 'proposed'
    returning id, user_id
  ), st as (
    insert into public.fsrs_state (card_id, user_id, fsrs_version, due)
    select id, user_id, p_fsrs_version, now() from kept
    on conflict do nothing
    returning 1
  )
  select count(*) into n from kept;
  return n;
end $$;

create function public.discard_cards(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  with d as (
    update public.card set status = 'discarded'
     where id = any(p_ids) and user_id = auth.uid() and status = 'proposed'
    returning 1
  )
  select count(*) into n from d;
  return n;
end $$;

revoke all on function public.keep_cards(uuid[], text), public.discard_cards(uuid[]) from public, anon;
grant execute on function public.keep_cards(uuid[], text), public.discard_cards(uuid[]) to authenticated;

-- Records one review atomically: append to review_log and move fsrs_state. Service role only: reviews can
-- come from a signed email link without a Supabase session, so the caller passes (and we check) the user id.
-- p_before must equal the stored state's due date, so a double submit grades a card only once.
create function public.record_review(
  p_user_id uuid, p_card_id uuid, p_grade integer, p_at timestamptz, p_duration_ms integer,
  p_before jsonb, p_after jsonb, p_elapsed_days integer, p_fsrs_version text
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_version integer;
begin
  select version into v_version from public.card where id = p_card_id and user_id = p_user_id and status = 'active';
  if v_version is null then raise exception 'card not found or not active' using errcode = 'P0002'; end if;

  update public.fsrs_state set
    due = (p_after->>'due')::timestamptz,
    stability = (p_after->>'stability')::double precision,
    difficulty = (p_after->>'difficulty')::double precision,
    elapsed_days = (p_after->>'elapsed_days')::int,
    scheduled_days = (p_after->>'scheduled_days')::int,
    learning_steps = (p_after->>'learning_steps')::int,
    reps = (p_after->>'reps')::int,
    lapses = (p_after->>'lapses')::int,
    state = (p_after->>'state')::smallint,
    last_review = (p_after->>'last_review')::timestamptz,
    fsrs_version = p_fsrs_version
  where card_id = p_card_id and user_id = p_user_id and due = (p_before->>'due')::timestamptz;
  if not found then raise exception 'stale review' using errcode = '40001'; end if;

  insert into public.review_log (user_id, card_id, card_version, rating, reviewed_at, elapsed_days,
                                 state_before, state_after, duration_ms, fsrs_version)
  values (p_user_id, p_card_id, v_version, p_grade, p_at, p_elapsed_days, p_before, p_after, p_duration_ms, p_fsrs_version);
end $$;

revoke all on function public.record_review(uuid, uuid, integer, timestamptz, integer, jsonb, jsonb, integer, text)
  from public, anon, authenticated;

-- R-NOT-02: for every user whose local reminder time falls in the current hour on a study day, enqueue one
-- reminder job. The key holds the local date, so running this twice (or every 15 minutes) enqueues once.
create function public.enqueue_reminders(p_now timestamptz default now()) returns integer
language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  with local as (
    select p.user_id, (p_now at time zone p.timezone) as ts, p.reminder_time, p.study_days
      from public.profile p
  ), due as (
    select user_id, ts::date as local_date
      from local
     where extract(dow from ts)::int = any (study_days)
       and ts >= date_trunc('day', ts) + reminder_time
       and ts <  date_trunc('day', ts) + reminder_time + interval '1 hour'
  ), ins as (
    insert into public.job (user_id, stage, idempotency_key, payload)
    select user_id, 'reminder', 'reminder:' || user_id || ':' || local_date, jsonb_build_object('local_date', local_date)
      from due
    on conflict (idempotency_key) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;

revoke all on function public.enqueue_reminders(timestamptz) from public, anon, authenticated;

-- Calls the app's worker through pg_net, only when a job is waiting. The URL and secret live in Vault
-- (names worker_url, worker_secret); without them this does nothing, so local development is unaffected.
create function public.kick_worker() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  if not exists (
    select 1 from public.job
     where (status = 'queued' and run_after <= now()) or (status = 'running' and lease_until < now())
  ) then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'worker_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'worker_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('authorization', 'Bearer ' || v_secret, 'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end $$;

revoke all on function public.kick_worker() from public, anon, authenticated;

-- Backstop worker every minute; reminders every 15 minutes (D17).
select cron.schedule('leitner-worker', '* * * * *', $$ select public.kick_worker() $$);
select cron.schedule('leitner-reminders', '*/15 * * * *', $$ select public.enqueue_reminders(); select public.kick_worker() $$);
