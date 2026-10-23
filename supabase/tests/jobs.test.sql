begin;
-- Start from an empty user table whatever the database holds (rolled back at the end).
delete from auth.users;
select plan(10);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', 'authenticated', 'authenticated');

-- R-CAP-05 / D17: the idempotency key makes enqueueing safe to repeat.
select isnt(public.enqueue_job('00000000-0000-0000-0000-00000000000a', null, 'extract', 'k1'), null, 'enqueue returns an id');
select is(public.enqueue_job('00000000-0000-0000-0000-00000000000a', null, 'extract', 'k1'), null,
  '[R-CAP-05] enqueueing the same key twice creates one job');
select is((select count(*)::int from public.job where idempotency_key = 'k1'), 1, 'one job row');

-- Claim: leases the job and counts the attempt; a second claim gets nothing while the lease holds.
select is((select count(*)::int from public.claim_jobs(5, 60)), 1, 'claim returns the due job');
select is((select attempts from public.job where idempotency_key = 'k1'), 1, 'attempt counted');
select is((select count(*)::int from public.claim_jobs(5, 60)), 0, 'a leased job is not claimed twice');

-- Failure: back-off, then terminal 'failed' after 3 attempts (R-PIPE-01).
select is(public.fail_job((select id from public.job where idempotency_key = 'k1'), 'boom'), 'queued',
  '[R-PIPE-01] first failure re-queues');
select cmp_ok((select run_after from public.job where idempotency_key = 'k1'), '>', now() + interval '1 minute',
  '[R-PIPE-01] retry is delayed (exponential back-off)');
update public.job set attempts = 3, run_after = now() where idempotency_key = 'k1';
select is(public.fail_job((select id from public.job where idempotency_key = 'k1'), 'boom'), 'failed',
  '[R-PIPE-01] the third failure is terminal');

-- A running job whose lease expired on its last attempt is swept to failed.
select public.enqueue_job('00000000-0000-0000-0000-00000000000a', null, 'extract', 'k2');
update public.job set status = 'running', attempts = 3, lease_until = now() - interval '1 minute' where idempotency_key = 'k2';
select is((select count(*)::int from public.sweep_dead_jobs()), 1, '[R-CAP-04] a dead job is swept and reported');

select * from finish();
rollback;
