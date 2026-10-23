-- Job queue interface (D17): enqueue / claim / complete / fail. Service role only.
create function public.enqueue_job(
  p_user_id uuid, p_capture_id uuid, p_stage text, p_key text,
  p_payload jsonb default '{}', p_run_after timestamptz default now()
) returns uuid language sql security invoker set search_path = '' as $$
  insert into public.job (user_id, capture_id, stage, idempotency_key, payload, run_after)
  values (p_user_id, p_capture_id, p_stage, p_key, p_payload, p_run_after)
  on conflict (idempotency_key) do nothing
  returning id;
$$;

-- Claims up to p_limit due jobs with FOR UPDATE SKIP LOCKED and a lease. A running job whose lease
-- expired is re-claimed while attempts remain.
create function public.claim_jobs(p_limit integer, p_lease_seconds integer)
returns setof public.job language sql security invoker set search_path = '' as $$
  update public.job j
     set status = 'running', attempts = j.attempts + 1,
         lease_until = now() + make_interval(secs => p_lease_seconds), updated_at = now()
   where j.id in (
     select id from public.job
      where run_after <= now() and attempts < max_attempts
        and (status = 'queued' or (status = 'running' and lease_until < now()))
      order by run_after
      limit p_limit
      for update skip locked)
  returning j.*;
$$;

create function public.complete_job(p_id uuid) returns void language sql security invoker set search_path = '' as $$
  update public.job set status = 'done', lease_until = null, error = null, updated_at = now() where id = p_id;
$$;

-- Failure: retry with exponential backoff (2^attempts minutes) until max_attempts, then 'failed'.
-- Returns the resulting status so the worker can send the failure receipt.
create function public.fail_job(p_id uuid, p_error text) returns text language sql security invoker set search_path = '' as $$
  update public.job
     set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
         run_after = now() + make_interval(mins => power(2, attempts)::int),
         lease_until = null, error = left(p_error, 2000), updated_at = now()
   where id = p_id
  returning status;
$$;

-- A job whose lease expired on its last attempt is never re-claimed: mark it failed and return it.
create function public.sweep_dead_jobs() returns setof public.job language sql security invoker set search_path = '' as $$
  update public.job set status = 'failed', lease_until = null, error = coalesce(error, 'lease expired'), updated_at = now()
   where status = 'running' and lease_until < now() and attempts >= max_attempts
  returning *;
$$;

-- Server-only: nobody but the service role may call these.
revoke all on function
  public.enqueue_job(uuid, uuid, text, text, jsonb, timestamptz),
  public.claim_jobs(integer, integer),
  public.complete_job(uuid),
  public.fail_job(uuid, text),
  public.sweep_dead_jobs()
  from public, anon, authenticated;
