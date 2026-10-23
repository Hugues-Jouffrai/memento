-- First-sign-in walkthrough (R-ONB-07, D56): null until the user skips or finishes it.
-- Every profile that exists now has already found its way around, so it is backfilled.
alter table public.profile add column welcome_done_at timestamptz;
update public.profile set welcome_done_at = now();
grant update (welcome_done_at) on public.profile to authenticated;
