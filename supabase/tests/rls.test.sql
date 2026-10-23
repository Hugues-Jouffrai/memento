begin;
select plan(3);

-- [R-SEC-01] Row-level security is enabled on every table in the public schema.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  '[R-SEC-01] every public table has RLS enabled'
);

-- ai_call is server-only: neither anon nor authenticated can read it.
set local role authenticated;
select is((select count(*)::int from public.ai_call), 0, '[R-SEC-01] authenticated sees no ai_call rows');
reset role;

set local role anon;
select is((select count(*)::int from public.ai_call), 0, '[R-SEC-01] anon sees no ai_call rows');
reset role;

select * from finish();
rollback;
